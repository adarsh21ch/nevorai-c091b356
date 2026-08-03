-- =====================================================================
-- Phase 6 — Workspace management: settings, members, invitations
-- =====================================================================
-- Adds:
--   1. workspace_invitations table + RLS + indexes
--   2. SECURITY DEFINER RPCs:
--        - rename_workspace(ws, name)
--        - change_workspace_slug(ws, new_slug)
--        - update_workspace_member_role(ws, user_id, role)
--        - remove_workspace_member(ws, user_id)
--        - create_workspace_invitation(ws, email, role) -> invitation row
--        - revoke_workspace_invitation(invitation_id)
--        - accept_workspace_invitation(token) -> workspace_id
--        - list_workspace_members(ws)        -> rows with email
--        - list_workspace_invitations(ws)    -> pending invites
--   3. workspace_members read policy expanded so members can see each
--      other within the same workspace.
--
-- All RPCs verify caller has owner/admin role in the target workspace.
-- Safe to re-run (idempotent CREATE OR REPLACE / IF NOT EXISTS).
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 1. Invitations table
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL,
  role          public.workspace_role NOT NULL DEFAULT 'member',
  token         text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  accepted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS workspace_invitations_ws_idx
  ON public.workspace_invitations (workspace_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx
  ON public.workspace_invitations (lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_invitations_token_idx
  ON public.workspace_invitations (token);

GRANT SELECT ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Read: members of the workspace see invites; invitee sees their own by email.
DROP POLICY IF EXISTS "invitations_read_member" ON public.workspace_invitations;
CREATE POLICY "invitations_read_member" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id)
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'),''))
  );

------------------------------------------------------------------------
-- 2. Expand workspace_members read policy: members can see co-members
------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_members_read_co" ON public.workspace_members;
CREATE POLICY "workspace_members_read_co" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

------------------------------------------------------------------------
-- 3. Internal helper: caller's role in a workspace
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._caller_role_in(_ws uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role::text FROM public.workspace_members
   WHERE workspace_id = _ws AND user_id = auth.uid()
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public._caller_role_in(uuid) TO authenticated;

------------------------------------------------------------------------
-- 4. Workspace rename + slug change
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_workspace(_ws uuid, _name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text;
BEGIN
  r := public._caller_role_in(_ws);
  IF r NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden: only owner/admin can rename workspace';
  END IF;
  IF coalesce(trim(_name),'') = '' THEN
    RAISE EXCEPTION 'workspace name required';
  END IF;
  UPDATE public.workspaces SET name = trim(_name) WHERE id = _ws;
END $$;
GRANT EXECUTE ON FUNCTION public.rename_workspace(uuid, text) TO authenticated;

-- Reserved slugs are also blocked by the reserved_subdomains table from Phase 0.
CREATE OR REPLACE FUNCTION public.change_workspace_slug(_ws uuid, _new_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r text;
  s text := lower(trim(_new_slug));
BEGIN
  r := public._caller_role_in(_ws);
  IF r <> 'owner' THEN
    RAISE EXCEPTION 'forbidden: only owner can change slug';
  END IF;
  IF s IS NULL OR length(s) < 3 OR length(s) > 40 THEN
    RAISE EXCEPTION 'slug must be 3-40 characters';
  END IF;
  IF s !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' THEN
    RAISE EXCEPTION 'slug may only contain lowercase letters, numbers and hyphens';
  END IF;
  IF s = 'legacy' THEN
    RAISE EXCEPTION 'slug "legacy" is reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reserved_subdomains WHERE name = s) THEN
    RAISE EXCEPTION 'slug "%" is reserved', s;
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE slug = s AND id <> _ws) THEN
    RAISE EXCEPTION 'slug "%" is already taken', s;
  END IF;
  UPDATE public.workspaces SET slug = s WHERE id = _ws;
END $$;
GRANT EXECUTE ON FUNCTION public.change_workspace_slug(uuid, text) TO authenticated;

------------------------------------------------------------------------
-- 5. Member role + removal
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_workspace_member_role(_ws uuid, _user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; owner_count int;
BEGIN
  r := public._caller_role_in(_ws);
  IF r <> 'owner' THEN
    RAISE EXCEPTION 'forbidden: only owner can change member roles';
  END IF;
  IF _role NOT IN ('owner','admin','member') THEN
    RAISE EXCEPTION 'invalid role %', _role;
  END IF;
  -- Prevent demoting the last remaining owner
  IF _role <> 'owner' THEN
    SELECT count(*) INTO owner_count FROM public.workspace_members
     WHERE workspace_id = _ws AND role = 'owner';
    IF owner_count <= 1 AND EXISTS (
      SELECT 1 FROM public.workspace_members
       WHERE workspace_id = _ws AND user_id = _user AND role = 'owner'
    ) THEN
      RAISE EXCEPTION 'cannot demote the last owner';
    END IF;
  END IF;
  UPDATE public.workspace_members
     SET role = _role::public.workspace_role
   WHERE workspace_id = _ws AND user_id = _user;
END $$;
GRANT EXECUTE ON FUNCTION public.update_workspace_member_role(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_workspace_member(_ws uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; owner_count int;
BEGIN
  r := public._caller_role_in(_ws);
  -- Allow self-leave for non-owners; owner/admin can remove others.
  IF auth.uid() <> _user AND r NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Don't strand a workspace with no owners
  SELECT count(*) INTO owner_count FROM public.workspace_members
   WHERE workspace_id = _ws AND role = 'owner';
  IF owner_count <= 1 AND EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = _ws AND user_id = _user AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'cannot remove the last owner';
  END IF;
  DELETE FROM public.workspace_members
   WHERE workspace_id = _ws AND user_id = _user;
END $$;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid, uuid) TO authenticated;

------------------------------------------------------------------------
-- 6. Invitations: create, revoke, accept
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_workspace_invitation(_ws uuid, _email text, _role text)
RETURNS public.workspace_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r text;
  v_token text;
  v_email text := lower(trim(_email));
  v_row public.workspace_invitations;
BEGIN
  r := public._caller_role_in(_ws);
  IF r NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden: only owner/admin can invite';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'valid email required';
  END IF;
  IF _role NOT IN ('owner','admin','member') THEN
    RAISE EXCEPTION 'invalid role %', _role;
  END IF;
  -- Already a member?
  IF EXISTS (
    SELECT 1 FROM public.workspace_members wm
      JOIN auth.users u ON u.id = wm.user_id
     WHERE wm.workspace_id = _ws AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'user is already a member of this workspace';
  END IF;
  -- Reuse any pending invite for the same (ws,email): revoke it first
  UPDATE public.workspace_invitations
     SET revoked_at = now()
   WHERE workspace_id = _ws AND lower(email) = v_email
     AND accepted_at IS NULL AND revoked_at IS NULL;

  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.workspace_invitations(workspace_id, email, role, token, created_by)
  VALUES (_ws, v_email, _role::public.workspace_role, v_token, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_workspace_invitation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.workspace_invitations; r text;
BEGIN
  SELECT * INTO inv FROM public.workspace_invitations WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation not found'; END IF;
  r := public._caller_role_in(inv.workspace_id);
  IF r NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.workspace_invitations SET revoked_at = now() WHERE id = _id;
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  inv public.workspace_invitations;
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'must be signed in'; END IF;

  SELECT * INTO inv FROM public.workspace_invitations WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation not found'; END IF;
  IF inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invitation has been revoked'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invitation already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invitation has expired'; END IF;
  IF v_email = '' OR lower(inv.email) <> v_email THEN
    RAISE EXCEPTION 'this invitation is for a different email address';
  END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (inv.workspace_id, v_uid, inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations
     SET accepted_at = now(), accepted_by = v_uid
   WHERE id = inv.id;

  RETURN inv.workspace_id;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

------------------------------------------------------------------------
-- 7. List helpers (joined with auth.users for email/name)
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_workspace_members(_ws uuid)
RETURNS TABLE(user_id uuid, email text, role text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public._caller_role_in(_ws) IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT wm.user_id, u.email::text, wm.role::text, wm.created_at
      FROM public.workspace_members wm
      JOIN auth.users u ON u.id = wm.user_id
     WHERE wm.workspace_id = _ws
     ORDER BY (CASE wm.role::text WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END), wm.created_at;
END $$;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_workspace_invitations(_ws uuid)
RETURNS SETOF public.workspace_invitations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public._caller_role_in(_ws) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT * FROM public.workspace_invitations
     WHERE workspace_id = _ws AND accepted_at IS NULL AND revoked_at IS NULL
     ORDER BY created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.list_workspace_invitations(uuid) TO authenticated;

COMMIT;
