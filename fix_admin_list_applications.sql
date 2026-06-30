-- Fix: structure of query does not match function result type
-- workspaces.status is the enum public.workspace_status, but the RPC
-- declares status text — cast it (and other enum-ish columns) to text.

BEGIN;

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
  ORDER BY w.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_applications() TO authenticated, service_role;

COMMIT;
