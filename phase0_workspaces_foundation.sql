-- =====================================================================
-- Phase 0 — White-Label Multi-Tenant Foundation
-- =====================================================================
-- HOW TO APPLY:
--   Open Supabase SQL Editor → New Query → paste this whole file → Run.
--   Then re-generate the typed schema (Lovable will refresh src/integrations/
--   supabase/types.ts on its own once the tables exist).
--
-- WHAT THIS DOES:
--   - Creates four new tables: workspaces, workspace_members,
--     workspace_branding, reserved_subdomains.
--   - Creates two helper functions: is_workspace_member, current_workspace_id.
--   - Backfills a single "legacy" workspace and adds every existing
--     auth.users user as a member of it.
--   - DOES NOT touch any existing table, query, or RLS policy.
--
-- ROLLBACK:
--   DROP TABLE public.workspace_branding, public.workspace_members,
--              public.workspaces, public.reserved_subdomains CASCADE;
--   DROP FUNCTION public.is_workspace_member(uuid),
--                 public.current_workspace_id();
--   DROP TYPE public.workspace_role, public.workspace_status;
-- =====================================================================

------------------------------------------------------------------------
-- 1. ENUMS
------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner','admin','member','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.workspace_status AS ENUM ('active','suspended','pending','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

------------------------------------------------------------------------
-- 2. TABLE: workspaces
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  name            text NOT NULL,
  status          public.workspace_status NOT NULL DEFAULT 'active',
  plan            text NOT NULL DEFAULT 'free',
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique_idx
  ON public.workspaces (lower(slug)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS workspaces_status_idx ON public.workspaces (status);
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON public.workspaces (owner_user_id);

GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.workspaces TO anon;
GRANT ALL    ON public.workspaces TO service_role;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------
-- 3. TABLE: workspace_members
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         public.workspace_role NOT NULL DEFAULT 'member',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON public.workspace_members (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------
-- 4. TABLE: workspace_branding
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_branding (
  workspace_id     uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  app_name         text,
  logo_url         text,
  favicon_url      text,
  primary_color    text,
  secondary_color  text,
  theme_color      text,
  email_from_name  text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.workspace_branding TO authenticated;
GRANT SELECT ON public.workspace_branding TO anon;
GRANT ALL    ON public.workspace_branding TO service_role;

ALTER TABLE public.workspace_branding ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------
-- 5. TABLE: reserved_subdomains
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserved_subdomains (
  slug   text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'reserved'
);

GRANT SELECT ON public.reserved_subdomains TO authenticated;
GRANT SELECT ON public.reserved_subdomains TO anon;
GRANT ALL    ON public.reserved_subdomains TO service_role;

ALTER TABLE public.reserved_subdomains ENABLE ROW LEVEL SECURITY;

INSERT INTO public.reserved_subdomains (slug, reason) VALUES
  ('www','infra'),('app','infra'),('admin','infra'),('api','infra'),
  ('mail','infra'),('static','infra'),('cdn','infra'),
  ('flow','product'),('nflow','product'),('ncall','product'),('nevorai','product'),
  ('support','infra'),('help','infra'),('docs','infra'),('blog','infra'),
  ('status','infra'),('auth','infra'),('login','infra'),('signup','infra'),
  ('billing','infra'),('public','infra'),('assets','infra'),('internal','infra'),
  ('legacy','reserved'),('test','reserved'),('dev','reserved'),('staging','reserved')
ON CONFLICT (slug) DO NOTHING;

------------------------------------------------------------------------
-- 6. SECURITY-DEFINER HELPERS
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v text;
BEGIN
  BEGIN
    v := current_setting('app.workspace_id', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated, anon;

------------------------------------------------------------------------
-- 7. RLS POLICIES (new tables only)
------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspaces_read_member" ON public.workspaces;
CREATE POLICY "workspaces_read_member" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(id));

DROP POLICY IF EXISTS "workspaces_read_anon_active" ON public.workspaces;
CREATE POLICY "workspaces_read_anon_active" ON public.workspaces
  FOR SELECT TO anon USING (status = 'active' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "workspace_members_read_self" ON public.workspace_members;
CREATE POLICY "workspace_members_read_self" ON public.workspace_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "workspace_branding_read_public" ON public.workspace_branding;
CREATE POLICY "workspace_branding_read_public" ON public.workspace_branding
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_id AND w.status = 'active' AND w.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "workspace_branding_write_member" ON public.workspace_branding;
CREATE POLICY "workspace_branding_write_member" ON public.workspace_branding
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "reserved_subdomains_read_all" ON public.reserved_subdomains;
CREATE POLICY "reserved_subdomains_read_all" ON public.reserved_subdomains
  FOR SELECT TO anon, authenticated USING (true);

------------------------------------------------------------------------
-- 8. BACKFILL
------------------------------------------------------------------------
INSERT INTO public.workspaces (slug, name, status, plan)
SELECT 'legacy', 'Nevorai (Legacy)', 'active', 'pro'
WHERE NOT EXISTS (SELECT 1 FROM public.workspaces WHERE lower(slug) = 'legacy');

INSERT INTO public.workspace_branding (workspace_id, app_name, primary_color, theme_color)
SELECT w.id, 'Nevorai', '#000000', '#ffffff'
FROM public.workspaces w
WHERE lower(w.slug) = 'legacy'
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 'member'::public.workspace_role
FROM public.workspaces w
CROSS JOIN auth.users u
WHERE lower(w.slug) = 'legacy'
ON CONFLICT (workspace_id, user_id) DO NOTHING;

------------------------------------------------------------------------
-- 9. VERIFICATION (run these manually after apply)
------------------------------------------------------------------------
-- SELECT count(*) AS workspaces_count FROM public.workspaces;
-- SELECT count(*) AS members_count FROM public.workspace_members;
-- SELECT count(*) AS users_count FROM auth.users;
-- workspaces_count should be 1; members_count should equal users_count.
