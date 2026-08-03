-- Cleanly separate "personal auto-created workspaces" from real
-- Enterprise "Applications" without deleting any user data.
--
-- What this does:
--   1. Adds workspaces.kind ('personal' | 'application')
--   2. Marks every existing workspace as 'personal' (they were all
--      auto-created by the tg_create_personal_workspace trigger)
--   3. Keeps the auto-create trigger, but new rows stay 'personal'
--   4. admin_list_applications() only returns kind='application'
--   5. admin_create_application() creates kind='application' rows
--
-- No workspaces, funnels, videos, leads, or memberships are deleted.
-- The Admin > Applications list will show only rows an admin
-- explicitly created for a paying/enterprise customer.

BEGIN;

-- 1. Column + enum-lite check
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'personal'
  CHECK (kind IN ('personal', 'application'));

CREATE INDEX IF NOT EXISTS workspaces_kind_idx ON public.workspaces(kind);

-- 2. Everything that exists today is a personal auto-workspace.
--    (Safe: nothing has been created via admin_create_application yet
--     since that was the source of the confusion.)
UPDATE public.workspaces SET kind = 'personal' WHERE kind IS NULL OR kind = '';

-- 3. Filter the admin listing to real Applications only.
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
    w.id,
    w.slug::text,
    w.name::text,
    w.plan::text,
    w.status::text,
    w.allow_team_management,
    w.created_at,
    w.deleted_at,
    owner.user_id   AS owner_id,
    u.email::text   AS owner_email,
    COALESCE(p.full_name, p.username, split_part(u.email::text,'@',1))::text AS owner_name,
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
  WHERE w.kind = 'application'      -- <<< the hide filter
    AND w.deleted_at IS NULL
  ORDER BY w.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_applications() TO authenticated, service_role;

-- 4. New admin-created rows are real Applications.
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

  INSERT INTO public.workspaces(slug, name, plan, status, allow_team_management, kind)
  VALUES (_slug, trim(_name), _plan, 'active', COALESCE(_allow_team, false), 'application')
  RETURNING id INTO v_ws;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_ws, _owner_id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_ws;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_application(text, text, uuid, text, boolean) TO authenticated, service_role;

COMMIT;
