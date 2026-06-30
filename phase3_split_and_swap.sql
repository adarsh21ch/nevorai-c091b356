-- =====================================================================
-- Phase 3 — Split `legacy` into per-owner workspaces + RLS swap
-- =====================================================================
-- PREREQUISITES: phase0, phase1, phase2 applied & verified.
--
-- WHAT THIS DOES (single transaction):
--   1. Slug helper: public.slugify(text)
--   2. For every distinct owner_id seen across tenant tables:
--        - create a workspace (slug from profiles.username, fallback
--          to email local-part, fallback to user-<8charuuid>)
--        - insert workspace_members(role='owner')
--   3. Reassign workspace_id on every tenant table:
--        a) rows with owner_id  -> that owner's new workspace
--        b) rows with user_id   -> that user's new workspace
--        c) child tables        -> inherit from parent via _workspace_parent_map
--        d) anything still on `legacy` is logged (raised as NOTICE, not error)
--   4. RLS swap, per tenant table:
--        - KEEP every policy whose roles include `anon` (public flows)
--        - DROP every other policy (owner/user/authenticated-only)
--        - CREATE 4 workspace-scoped policies:
--             ws_select / ws_insert / ws_update / ws_delete
--          all using public.same_workspace_as(workspace_id)
--   5. Tighten tg_autofill_workspace_id():
--        - removes the legacy_workspace_id() fallback
--        - RAISE EXCEPTION if no workspace can be resolved
--
-- ROLLBACK: phase3_split_and_swap_rollback.sql  (restores legacy reassign
--           + recreates the previous auto-fill function; original custom
--           policies are NOT restored — keep a pg_dump before running.)
-- VERIFY:   phase3_split_and_swap_verify.sql
--
-- ⚠ BACK UP THE DATABASE BEFORE RUNNING. RLS policy rewrites are
--   irreversible without a dump.
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 0. Sanity: phases 0-2 applied
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE slug='legacy') THEN
    RAISE EXCEPTION 'Phase 0 not applied (legacy workspace missing)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='same_workspace_as') THEN
    RAISE EXCEPTION 'Phase 2 not applied (same_workspace_as missing)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._workspace_parent_map LIMIT 1) THEN
    RAISE EXCEPTION 'Phase 2 not applied (_workspace_parent_map empty)';
  END IF;
END $$;

------------------------------------------------------------------------
-- 1. Slug helper
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slugify(_in text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(coalesce(_in,'')), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ), ''
  )
$$;

------------------------------------------------------------------------
-- 2. Create per-owner workspaces + membership
------------------------------------------------------------------------
-- Collect every user that owns at least one tenant row.
DO $$
DECLARE
  r          record;
  v_owners   uuid[] := ARRAY[]::uuid[];
  v_uid      uuid;
  v_slug     text;
  v_base     text;
  v_name     text;
  v_n        int;
  v_ws_id    uuid;
  v_legacy   uuid := public.legacy_workspace_id();
BEGIN
  -- Gather distinct owner_id / user_id across every tenant table
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name IN ('owner_id','user_id')
       AND EXISTS (
         SELECT 1 FROM information_schema.columns c2
          WHERE c2.table_schema='public' AND c2.table_name=c.table_name
            AND c2.column_name='workspace_id')
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding','user_roles')
  LOOP
    EXECUTE format(
      'SELECT array_agg(DISTINCT %I) FROM public.%I WHERE %I IS NOT NULL',
      r.column_name, r.table_name, r.column_name)
      INTO v_owners
      USING;  -- no params
    -- merge into running set by re-querying; simpler: union into temp table
    IF v_owners IS NOT NULL THEN
      INSERT INTO pg_temp._owners(uid)
      SELECT unnest(v_owners) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- first iteration: create temp table and retry
  CREATE TEMP TABLE _owners(uid uuid PRIMARY KEY);
  -- re-run by recursive call (simplest: raise notice and re-execute block)
  RAISE NOTICE 'retrying owner collection with temp table';
END $$;

-- Robust second pass (temp table guaranteed to exist now)
CREATE TEMP TABLE IF NOT EXISTS _owners(uid uuid PRIMARY KEY);

DO $$
DECLARE r record; v_owners uuid[];
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name IN ('owner_id','user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns c2
                    WHERE c2.table_schema='public' AND c2.table_name=c.table_name
                      AND c2.column_name='workspace_id')
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding','user_roles')
  LOOP
    EXECUTE format(
      'SELECT array_agg(DISTINCT %I) FROM public.%I WHERE %I IS NOT NULL',
      r.column_name, r.table_name, r.column_name) INTO v_owners;
    IF v_owners IS NOT NULL THEN
      INSERT INTO _owners(uid) SELECT unnest(v_owners) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Also include every signed-up auth user so they get a personal workspace
INSERT INTO _owners(uid)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;

-- Create workspace + membership for each owner that doesn't have one
DO $$
DECLARE
  o record;
  v_slug text;
  v_base text;
  v_name text;
  v_n    int;
  v_ws   uuid;
BEGIN
  FOR o IN SELECT uid FROM _owners LOOP
    -- Already has a non-legacy workspace where they're owner? skip.
    SELECT wm.workspace_id INTO v_ws
      FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = o.uid
       AND wm.role IN ('owner','admin')
       AND w.slug <> 'legacy'
     LIMIT 1;
    IF v_ws IS NOT NULL THEN CONTINUE; END IF;

    -- Build slug: username -> email local-part -> user-<short>
    SELECT public.slugify(p.username)
      INTO v_base
      FROM public.profiles p
     WHERE p.id = o.uid;

    IF v_base IS NULL THEN
      SELECT public.slugify(split_part(u.email, '@', 1))
        INTO v_base
        FROM auth.users u WHERE u.id = o.uid;
    END IF;

    IF v_base IS NULL OR length(v_base) < 2 THEN
      v_base := 'user-' || substr(o.uid::text, 1, 8);
    END IF;

    -- Pick a friendly display name
    SELECT COALESCE(NULLIF(p.full_name,''), NULLIF(p.username,''), v_base)
      INTO v_name FROM public.profiles p WHERE p.id = o.uid;
    IF v_name IS NULL THEN v_name := v_base; END IF;

    -- Collision-proof slug
    v_slug := v_base;
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO public.workspaces(slug, name, status, plan)
    VALUES (v_slug, v_name, 'active', 'free')
    RETURNING id INTO v_ws;

    INSERT INTO public.workspace_members(workspace_id, user_id, role)
    VALUES (v_ws, o.uid, 'owner')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 3. Reassign workspace_id away from `legacy` to the owner's workspace
------------------------------------------------------------------------
-- Helper: owner's primary (non-legacy) workspace
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

DO $$
DECLARE
  r        record;
  v_cols   text[];
  v_parent record;
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

    -- (a) owner_id-based reassignment
    IF 'owner_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I t SET workspace_id = public.primary_workspace_of(t.owner_id)
           WHERE t.workspace_id = $1
             AND t.owner_id IS NOT NULL
             AND public.primary_workspace_of(t.owner_id) IS NOT NULL',
        r.table_name) USING v_legacy;
    END IF;

    -- (b) user_id-based reassignment
    IF 'user_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I t SET workspace_id = public.primary_workspace_of(t.user_id)
           WHERE t.workspace_id = $1
             AND t.user_id IS NOT NULL
             AND public.primary_workspace_of(t.user_id) IS NOT NULL',
        r.table_name) USING v_legacy;
    END IF;
  END LOOP;

  -- (c) child tables: re-derive from parent (covers rows with no owner/user)
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

-- (d) Report how many rows are still on legacy (informational)
DO $$
DECLARE r record; n int; total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id = $1', r.table_name)
      INTO n USING public.legacy_workspace_id();
    IF n > 0 THEN
      RAISE NOTICE 'still on legacy: % rows in %', n, r.table_name;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 'TOTAL rows still on legacy workspace: %', total;
END $$;

------------------------------------------------------------------------
-- 4. RLS swap: keep anon-readable policies, replace owner-only policies
------------------------------------------------------------------------
DO $$
DECLARE
  r       record;
  p       record;
  has_anon boolean;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    -- Drop every policy on this table that is NOT granted to anon.
    FOR p IN
      SELECT policyname, roles
        FROM pg_policies
       WHERE schemaname='public' AND tablename=r.table_name
    LOOP
      has_anon := 'anon' = ANY(p.roles) OR 'public' = ANY(p.roles);
      IF NOT has_anon THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, r.table_name);
      END IF;
    END LOOP;

    -- Make sure RLS is enabled (Phase 1 should have done this, but be safe)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);

    -- Install workspace-scoped policies for authenticated users
    EXECUTE format($f$
      CREATE POLICY ws_select ON public.%1$I
        FOR SELECT TO authenticated
        USING (public.same_workspace_as(workspace_id))
    $f$, r.table_name);

    EXECUTE format($f$
      CREATE POLICY ws_insert ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (public.same_workspace_as(workspace_id))
    $f$, r.table_name);

    EXECUTE format($f$
      CREATE POLICY ws_update ON public.%1$I
        FOR UPDATE TO authenticated
        USING (public.same_workspace_as(workspace_id))
        WITH CHECK (public.same_workspace_as(workspace_id))
    $f$, r.table_name);

    EXECUTE format($f$
      CREATE POLICY ws_delete ON public.%1$I
        FOR DELETE TO authenticated
        USING (public.same_workspace_as(workspace_id))
    $f$, r.table_name);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 5. Tighten the auto-fill trigger (remove legacy safety net)
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payload jsonb := to_jsonb(NEW);
  v_ws uuid;
  v_owner uuid; v_user uuid;
  v_parent record; v_parent_id uuid;
BEGIN
  v_ws := (v_payload->>'workspace_id')::uuid;
  IF v_ws IS NOT NULL THEN RETURN NEW; END IF;

  v_ws := public.current_workspace_id();
  IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;

  BEGIN v_owner := (v_payload->>'owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  IF v_owner IS NOT NULL THEN
    v_ws := public.primary_workspace_of(v_owner);
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  BEGIN v_user := (v_payload->>'user_id')::uuid; EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF v_user IS NOT NULL THEN
    v_ws := public.primary_workspace_of(v_user);
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  SELECT parent_table, parent_fk_column INTO v_parent
    FROM public._workspace_parent_map WHERE table_name = TG_TABLE_NAME;
  IF FOUND THEN
    BEGIN v_parent_id := (v_payload->>v_parent.parent_fk_column)::uuid;
    EXCEPTION WHEN OTHERS THEN v_parent_id := NULL; END;
    IF v_parent_id IS NOT NULL THEN
      EXECUTE format('SELECT workspace_id FROM public.%I WHERE id = $1', v_parent.parent_table)
        INTO v_ws USING v_parent_id;
      IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
    END IF;
  END IF;

  -- Fallback for authenticated caller: their own primary workspace
  IF auth.uid() IS NOT NULL THEN
    v_ws := public.primary_workspace_of(auth.uid());
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  RAISE EXCEPTION 'tg_autofill_workspace_id: cannot resolve workspace_id for table % (no owner/user/parent/session)', TG_TABLE_NAME;
END;
$$;

COMMIT;

-- =====================================================================
-- DONE. Run phase3_split_and_swap_verify.sql.
-- =====================================================================
