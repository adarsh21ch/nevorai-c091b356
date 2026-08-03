-- =====================================================================
-- Phase R — Repair after phase 0/1/2/3 workspace migration
-- =====================================================================
-- IDEMPOTENT. Safe to run multiple times. Single transaction.
--
-- WHAT THIS FIXES (root cause of the "Something went wrong" card on every
-- page in production):
--
--   1. Some auth.users have NO workspace_members row (the per-owner
--      workspace was not created for them during phase 3, or they signed
--      up between phase 3 and now). RLS policies installed by phase 3
--      check `same_workspace_as(workspace_id)` which returns FALSE for
--      these users on every read → app renders with empty everything and
--      `.single()` callers throw → ErrorBoundary catches at the root.
--
--   2. Some tenant rows are still pinned to the `legacy` workspace
--      because phase 3 only re-pointed rows where owner_id/user_id had a
--      derived primary workspace. Rows owned by users without a workspace
--      stayed on `legacy` and are invisible to their owner.
--
--   3. New signups can land in the same broken state because there is no
--      auth.users INSERT trigger that creates a personal workspace.
--
-- This migration:
--   - Mints a personal workspace + owner membership for every auth.users
--     row that doesn't have one.
--   - Re-points any tenant rows still on `legacy` (or any orphan
--     workspace_id) to the owner/user's primary workspace.
--   - Installs an AFTER INSERT trigger on auth.users that auto-creates a
--     workspace + owner membership for every new signup.
--   - Re-verifies GRANTs on workspaces / workspace_members /
--     workspace_branding so the Data API can reach them.
--
-- HOW TO RUN: paste this whole file into Supabase SQL Editor and Run.
-- VERIFY:     scroll to the bottom — the SELECTs report 0 rows remaining
--             on legacy and 0 users without a workspace.
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 0. Sanity: phase 0 ran (legacy workspace + helpers exist)
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE slug='legacy') THEN
    RAISE EXCEPTION 'Phase 0 not applied: legacy workspace missing. Apply phase0_workspaces_foundation.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='resolve_user_workspace') THEN
    RAISE EXCEPTION 'Phase 0 not applied: resolve_user_workspace() missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='primary_workspace_of') THEN
    -- phase 3 helper; recreate it here so phase R can run standalone.
    NULL;
  END IF;
END $$;

------------------------------------------------------------------------
-- 1. Ensure primary_workspace_of() exists (phase 3 helper)
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.primary_workspace_of(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT wm.workspace_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
   WHERE wm.user_id = _uid
     AND wm.role IN ('owner','admin')
     AND w.slug <> 'legacy'
   ORDER BY wm.created_at NULLS LAST
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.primary_workspace_of(uuid) TO authenticated, anon, service_role;

------------------------------------------------------------------------
-- 2. Mint a personal workspace + owner membership for every auth user
--    that doesn't have one yet.
------------------------------------------------------------------------
DO $$
DECLARE
  u       record;
  v_base  text;
  v_slug  text;
  v_name  text;
  v_n     int;
  v_ws    uuid;
BEGIN
  FOR u IN
    SELECT au.id, au.email
      FROM auth.users au
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.workspace_members wm
         JOIN public.workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = au.id
          AND wm.role IN ('owner','admin')
          AND w.slug <> 'legacy'
     )
  LOOP
    -- Build slug: profile username -> email local-part -> user-<short>
    SELECT public.slugify(p.username) INTO v_base
      FROM public.profiles p WHERE p.id = u.id;
    IF v_base IS NULL OR length(v_base) < 2 THEN
      v_base := public.slugify(split_part(coalesce(u.email,''), '@', 1));
    END IF;
    IF v_base IS NULL OR length(v_base) < 2 THEN
      v_base := 'user-' || substr(u.id::text, 1, 8);
    END IF;

    -- Friendly display name
    SELECT COALESCE(NULLIF(p.full_name,''), NULLIF(p.username,''), v_base)
      INTO v_name FROM public.profiles p WHERE p.id = u.id;
    IF v_name IS NULL THEN v_name := v_base; END IF;

    -- Unique slug
    v_slug := v_base;
    v_n    := 1;
    WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO public.workspaces(slug, name, status, plan)
    VALUES (v_slug, v_name, 'active', 'free')
    RETURNING id INTO v_ws;

    INSERT INTO public.workspace_members(workspace_id, user_id, role)
    VALUES (v_ws, u.id, 'owner')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 3. Re-point any tenant rows still on the legacy workspace to their
--    owner's primary workspace.
------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  v_cols   text[];
  v_legacy uuid := public.legacy_workspace_id();
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    SELECT array_agg(column_name) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=r.table_name;

    -- (a) owner_id-based re-assignment
    IF 'owner_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I t SET workspace_id = public.primary_workspace_of(t.owner_id)
           WHERE t.workspace_id = $1
             AND t.owner_id IS NOT NULL
             AND public.primary_workspace_of(t.owner_id) IS NOT NULL',
        r.table_name) USING v_legacy;
    END IF;

    -- (b) user_id-based re-assignment
    IF 'user_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I t SET workspace_id = public.primary_workspace_of(t.user_id)
           WHERE t.workspace_id = $1
             AND t.user_id IS NOT NULL
             AND public.primary_workspace_of(t.user_id) IS NOT NULL',
        r.table_name) USING v_legacy;
    END IF;
  END LOOP;

  -- (c) child tables: re-derive from parent
  FOR r IN SELECT table_name, parent_table, parent_fk_column
             FROM public._workspace_parent_map LOOP
    EXECUTE format(
      'UPDATE public.%I c SET workspace_id = p.workspace_id
         FROM public.%I p
        WHERE c.%I = p.id
          AND c.workspace_id = $1
          AND p.workspace_id <> $1',
      r.table_name, r.parent_table, r.parent_fk_column) USING v_legacy;
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 4. Auto-create a workspace + owner membership for every NEW signup.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_create_personal_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_slug text;
  v_name text;
  v_n    int;
  v_ws   uuid;
BEGIN
  -- Skip if this user somehow already has a workspace_members row
  IF EXISTS (
    SELECT 1 FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = NEW.id
       AND wm.role IN ('owner','admin')
       AND w.slug <> 'legacy'
  ) THEN
    RETURN NEW;
  END IF;

  v_base := public.slugify(split_part(coalesce(NEW.email,''), '@', 1));
  IF v_base IS NULL OR length(v_base) < 2 THEN
    v_base := 'user-' || substr(NEW.id::text, 1, 8);
  END IF;

  v_name := coalesce(NEW.raw_user_meta_data->>'full_name', v_base);

  v_slug := v_base;
  v_n    := 1;
  WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  INSERT INTO public.workspaces(slug, name, status, plan)
  VALUES (v_slug, v_name, 'active', 'free')
  RETURNING id INTO v_ws;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_ws, NEW.id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_create_personal_workspace ON auth.users;
CREATE TRIGGER tg_create_personal_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_personal_workspace();

------------------------------------------------------------------------
-- 5. Re-verify Data API GRANTs (defensive — should already exist).
------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces        TO authenticated;
GRANT ALL                          ON public.workspaces        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL                          ON public.workspace_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_branding TO authenticated;
GRANT ALL                          ON public.workspace_branding TO service_role;

COMMIT;

-- =====================================================================
-- VERIFY — these should both return zero
-- =====================================================================
SELECT 'users_without_workspace' AS check, count(*) AS bad
  FROM auth.users au
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.workspace_members wm
     JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = au.id
      AND wm.role IN ('owner','admin')
      AND w.slug <> 'legacy'
 );

-- Count tenant rows still pinned to legacy (informational; ideally 0)
DO $$
DECLARE r record; v_legacy uuid := public.legacy_workspace_id(); n int; total int := 0;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id = $1', r.table_name)
      INTO n USING v_legacy;
    IF n > 0 THEN
      RAISE NOTICE 'still on legacy: % = % rows', r.table_name, n;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 'TOTAL rows still on legacy: %', total;
END $$;
