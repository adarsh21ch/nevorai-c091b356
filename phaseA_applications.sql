-- =====================================================================
-- Phase A — Applications (admin-managed workspaces)
-- =====================================================================
-- IDEMPOTENT. Single transaction. Run AFTER phaseR_repair.sql.
--
-- Locks the `workspaces` and `workspace_members` tables down so only the
-- platform admin can create/edit/delete them. Regular users keep read
-- access to workspaces they belong to, and (when the per-Application
-- toggle is on) the owner of an Application can manage its members.
--
-- Adds:
--   - workspaces.allow_team_management boolean (default FALSE)
--   - reserved-slug enforcement in create/update RPCs
--   - admin RPCs: admin_list_applications, admin_create_application,
--                 admin_update_application, admin_delete_application,
--                 admin_transfer_application, admin_set_team_toggle
--   - owner RPC: owner_add_team_member, owner_remove_team_member
--                (only callable when allow_team_management is TRUE)
--
-- HOW TO RUN: paste into Supabase SQL Editor → Run.
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 0. Prereqs: has_role() + admin app_role
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    RAISE EXCEPTION 'has_role() missing. Apply the user-roles foundation first.';
  END IF;
END $$;

------------------------------------------------------------------------
-- 1. New column: allow_team_management
------------------------------------------------------------------------
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS allow_team_management boolean NOT NULL DEFAULT false;

------------------------------------------------------------------------
-- 2. Reserved-slug guard
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_reserved_slug(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(_slug) = ANY(ARRAY[
    'admin','api','app','auth','www','nevorai','flow','nflow','launchpad',
    'ncall','backupshala','support','help','blog','docs','cdn','static',
    'mail','smtp','ftp','dashboard','login','signup','signin','signout',
    'register','onboarding','public','private','internal','assets'
  ]);
$$;

------------------------------------------------------------------------
-- 3. Lock down workspaces RLS (admin-only writes)
------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Drop every existing policy on workspaces and recreate from scratch.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='workspaces' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspaces', p.policyname);
  END LOOP;
END $$;

-- Members can SEE their own workspaces (read-only)
CREATE POLICY ws_select_members ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = workspaces.id
         AND wm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Only admins can INSERT/UPDATE/DELETE workspaces
CREATE POLICY ws_admin_insert ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ws_admin_update ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ws_admin_delete ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

------------------------------------------------------------------------
-- 4. Lock down workspace_members RLS
------------------------------------------------------------------------
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='workspace_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workspace_members', p.policyname);
  END LOOP;
END $$;

-- A user can see their OWN memberships + co-members of the same workspace
CREATE POLICY wm_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members me
       WHERE me.workspace_id = workspace_members.workspace_id
         AND me.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- INSERT/UPDATE/DELETE only by admin (server-side RPCs use SECURITY DEFINER
-- to grant owners team-management when the per-app toggle is on)
CREATE POLICY wm_admin_write ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

------------------------------------------------------------------------
-- 5. Admin RPCs (SECURITY DEFINER, gated by has_role check)
------------------------------------------------------------------------

-- 5a. List all applications with owner + member counts
CREATE OR REPLACE FUNCTION public.admin_list_applications()
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  plan text,
  status text,
  allow_team_management boolean,
  created_at timestamptz,
  deleted_at timestamptz,
  owner_id uuid,
  owner_email text,
  owner_name text,
  member_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT
    w.id, w.slug, w.name, w.plan, w.status, w.allow_team_management,
    w.created_at, w.deleted_at,
    owner.user_id   AS owner_id,
    u.email::text   AS owner_email,
    COALESCE(p.full_name, p.username, split_part(u.email,'@',1)) AS owner_name,
    (SELECT count(*)::int FROM public.workspace_members m WHERE m.workspace_id = w.id) AS member_count
  FROM public.workspaces w
  LEFT JOIN LATERAL (
    SELECT wm.user_id
      FROM public.workspace_members wm
     WHERE wm.workspace_id = w.id AND wm.role = 'owner'
     ORDER BY wm.created_at NULLS LAST
     LIMIT 1
  ) owner ON true
  LEFT JOIN auth.users u ON u.id = owner.user_id
  LEFT JOIN public.profiles p ON p.id = owner.user_id
  ORDER BY w.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_applications() TO authenticated, service_role;

-- 5b. Search profiles for the user-picker
CREATE OR REPLACE FUNCTION public.admin_search_users(_q text, _limit int DEFAULT 20)
RETURNS TABLE (id uuid, email text, full_name text, username text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text,
         COALESCE(p.full_name, '') AS full_name,
         COALESCE(p.username, '')  AS username
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE _q IS NULL OR _q = '' OR
         u.email ILIKE '%' || _q || '%' OR
         p.full_name ILIKE '%' || _q || '%' OR
         p.username  ILIKE '%' || _q || '%'
   ORDER BY u.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 50));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int) TO authenticated, service_role;

-- 5c. Create application + assign owner
CREATE OR REPLACE FUNCTION public.admin_create_application(
  _name text, _slug text, _owner_id uuid, _plan text DEFAULT 'free', _allow_team boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ws uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Validate
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'name required';
  END IF;
  IF _slug IS NULL OR _slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' THEN
    RAISE EXCEPTION 'slug must be 3-40 chars: lowercase letters, numbers, hyphens';
  END IF;
  IF public.is_reserved_slug(_slug) THEN
    RAISE EXCEPTION 'slug is reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE slug = _slug) THEN
    RAISE EXCEPTION 'slug already in use';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _owner_id) THEN
    RAISE EXCEPTION 'owner user not found';
  END IF;
  IF _plan NOT IN ('free','basic','pro') THEN
    RAISE EXCEPTION 'plan must be free|basic|pro';
  END IF;

  INSERT INTO public.workspaces(slug, name, plan, status, allow_team_management)
  VALUES (_slug, trim(_name), _plan, 'active', COALESCE(_allow_team, false))
  RETURNING id INTO v_ws;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_ws, _owner_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_ws;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_application(text, text, uuid, text, boolean) TO authenticated, service_role;

-- 5d. Update application (name/slug/plan/status/allow_team_management)
CREATE OR REPLACE FUNCTION public.admin_update_application(
  _ws uuid,
  _name text DEFAULT NULL,
  _slug text DEFAULT NULL,
  _plan text DEFAULT NULL,
  _status text DEFAULT NULL,
  _allow_team boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF _slug IS NOT NULL THEN
    IF _slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' THEN
      RAISE EXCEPTION 'slug must be 3-40 chars: lowercase letters, numbers, hyphens';
    END IF;
    IF public.is_reserved_slug(_slug) THEN
      RAISE EXCEPTION 'slug is reserved';
    END IF;
    IF EXISTS (SELECT 1 FROM public.workspaces WHERE slug = _slug AND id <> _ws) THEN
      RAISE EXCEPTION 'slug already in use';
    END IF;
  END IF;

  IF _plan IS NOT NULL AND _plan NOT IN ('free','basic','pro') THEN
    RAISE EXCEPTION 'plan must be free|basic|pro';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'status must be active|suspended';
  END IF;

  UPDATE public.workspaces SET
    name                  = COALESCE(trim(_name), name),
    slug                  = COALESCE(_slug, slug),
    plan                  = COALESCE(_plan, plan),
    status                = COALESCE(_status, status),
    allow_team_management = COALESCE(_allow_team, allow_team_management)
  WHERE id = _ws;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_application(uuid, text, text, text, text, boolean) TO authenticated, service_role;

-- 5e. Soft-delete (sets deleted_at)
CREATE OR REPLACE FUNCTION public.admin_delete_application(_ws uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.workspaces SET deleted_at = now(), status = 'suspended' WHERE id = _ws;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_application(uuid) TO authenticated, service_role;

-- 5f. Transfer ownership to another user
CREATE OR REPLACE FUNCTION public.admin_transfer_application(_ws uuid, _new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _new_owner) THEN
    RAISE EXCEPTION 'new owner not found';
  END IF;

  -- Demote existing owners
  UPDATE public.workspace_members SET role = 'admin'
    WHERE workspace_id = _ws AND role = 'owner';

  -- Promote / insert the new owner
  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (_ws, _new_owner, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_transfer_application(uuid, uuid) TO authenticated, service_role;

------------------------------------------------------------------------
-- 6. Owner RPCs (only when allow_team_management = TRUE)
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_add_team_member(_ws uuid, _user uuid, _role text DEFAULT 'member')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = _ws AND w.allow_team_management = true
  ) THEN
    RAISE EXCEPTION 'team management not enabled for this application';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = _ws AND user_id = auth.uid() AND role IN ('owner','admin')
  ) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not the owner of this application';
  END IF;
  IF _role NOT IN ('admin','member') THEN
    RAISE EXCEPTION 'role must be admin or member';
  END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (_ws, _user, _role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
GRANT EXECUTE ON FUNCTION public.owner_add_team_member(uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owner_remove_team_member(_ws uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = _ws AND user_id = auth.uid() AND role IN ('owner','admin')
  ) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not the owner of this application';
  END IF;
  -- Never remove an owner via this path
  DELETE FROM public.workspace_members
   WHERE workspace_id = _ws AND user_id = _user AND role <> 'owner';
END;
$$;
GRANT EXECUTE ON FUNCTION public.owner_remove_team_member(uuid, uuid) TO authenticated, service_role;

------------------------------------------------------------------------
-- 7. Defensive grants
------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces        TO authenticated;
GRANT ALL                          ON public.workspaces        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL                          ON public.workspace_members TO service_role;

COMMIT;

-- =====================================================================
-- DONE.
-- =====================================================================
