-- =====================================================================
-- Phase 2 — NOT NULL enforcement, smart auto-fill, RLS helpers
-- =====================================================================
-- PREREQUISITE: phase0_workspaces_foundation.sql + phase1_tenant_columns.sql
--               have been applied and verified (all workspace_id columns
--               are present and zero rows are NULL).
--
-- WHAT THIS DOES:
--   1. Replaces the Phase 1 generic auto-fill trigger with a smart one
--      that resolves workspace_id at INSERT time from:
--        a) NEW.workspace_id if already set
--        b) current_workspace_id() GUC (set by app middleware)
--        c) NEW.owner_id  → resolve_user_workspace
--        d) NEW.user_id   → resolve_user_workspace
--        e) parent FK lookup via _workspace_parent_map
--        f) legacy_workspace_id() as last-resort safety net
--      This guarantees NEW.workspace_id is non-NULL before NOT NULL fires.
--
--   2. Flips workspace_id to NOT NULL on every tenant table.
--
--   3. Installs workspace-scoped RLS helper functions:
--        - my_workspace_ids()           — uuid[] of caller's workspaces
--        - is_workspace_member(uuid)    — already from Phase 0; reused
--        - same_workspace_as(uuid)      — convenience: row's ws ∈ mine
--
--   4. Does NOT replace existing owner-based RLS policies. Those continue
--      to govern access. Phase 3 will swap them atomically AFTER the
--      `legacy` workspace is split into per-owner workspaces, which is
--      the only safe sequence — adding workspace-member read policies
--      while every user is still a member of the same `legacy` workspace
--      would cause cross-user data exposure.
--
-- HOW TO APPLY:
--   Supabase SQL Editor → paste this whole file → Run. Single transaction.
--
-- ROLLBACK: phase2_notnull_and_helpers_rollback.sql
-- VERIFY:   phase2_notnull_and_helpers_verify.sql
-- =====================================================================

BEGIN;

------------------------------------------------------------------------
-- 0a. Re-backfill any rows inserted between Phase 1 and Phase 2
------------------------------------------------------------------------
-- Phase 1's trigger only honoured current_workspace_id() GUC; app code
-- that didn't set the GUC produced NULL workspace_id rows in the window
-- between Phase 1 and this script. Re-apply the Phase 1 backfill chain
-- (owner_id → user_id → parent FK → legacy) before the sanity check.
DO $$
DECLARE
  r record;
  v_parent record;
  v_cols  text[];
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    -- columns present on this table
    SELECT array_agg(column_name) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=r.table_name;

    -- (a) owner_id → resolve
    IF 'owner_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I SET workspace_id = public.resolve_user_workspace(owner_id)
           WHERE workspace_id IS NULL AND owner_id IS NOT NULL', r.table_name);
    END IF;
    -- (b) user_id → resolve
    IF 'user_id' = ANY(v_cols) THEN
      EXECUTE format(
        'UPDATE public.%I SET workspace_id = public.resolve_user_workspace(user_id)
           WHERE workspace_id IS NULL AND user_id IS NOT NULL', r.table_name);
    END IF;
    -- (c) parent FK derivation (best-effort: try common parent columns)
    FOR v_parent IN
      SELECT 'funnels'::text AS parent_table, 'funnel_id'::text AS fk WHERE 'funnel_id' = ANY(v_cols)
      UNION ALL SELECT 'landing_pages','landing_page_id' WHERE 'landing_page_id' = ANY(v_cols)
      UNION ALL SELECT 'live_sessions','session_id'      WHERE 'session_id'      = ANY(v_cols) AND r.table_name LIKE 'live_%' AND NOT ('live_session_id' = ANY(v_cols))
      UNION ALL SELECT 'live_sessions','live_session_id' WHERE 'live_session_id' = ANY(v_cols)
      UNION ALL SELECT 'video_assets','video_id'         WHERE 'video_id'        = ANY(v_cols)
      UNION ALL SELECT 'whatsapp_automations','automation_id' WHERE 'automation_id' = ANY(v_cols)
    LOOP
      EXECUTE format(
        'UPDATE public.%I c SET workspace_id = p.workspace_id
           FROM public.%I p WHERE c.%I = p.id AND c.workspace_id IS NULL',
        r.table_name, v_parent.parent_table, v_parent.fk);
    END LOOP;
    -- (d) legacy safety net
    EXECUTE format(
      'UPDATE public.%I SET workspace_id = public.legacy_workspace_id() WHERE workspace_id IS NULL',
      r.table_name);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 0b. Sanity checks
------------------------------------------------------------------------

DO $$
DECLARE
  _legacy uuid;
  _nullable int;
BEGIN
  SELECT id INTO _legacy FROM public.workspaces WHERE lower(slug) = 'legacy';
  IF _legacy IS NULL THEN
    RAISE EXCEPTION 'Phase 0 not applied: legacy workspace missing.';
  END IF;

  -- Refuse if any tenant table still has NULL workspace_id rows.
  DECLARE r record; bad int;
  BEGIN
    FOR r IN
      SELECT c.table_name
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.column_name = 'workspace_id'
         AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
    LOOP
      EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id IS NULL', r.table_name) INTO bad;
      IF bad > 0 THEN
        RAISE EXCEPTION 'Phase 1 incomplete: % NULL workspace_id rows in %', bad, r.table_name;
      END IF;
    END LOOP;
  END;
END $$;

------------------------------------------------------------------------
-- 1. Parent FK map (drives auto-fill for W-child tables)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._workspace_parent_map (
  table_name        text PRIMARY KEY,
  parent_table      text NOT NULL,
  parent_fk_column  text NOT NULL
);

GRANT SELECT ON public._workspace_parent_map TO authenticated, anon, service_role;

-- Children of funnels
INSERT INTO public._workspace_parent_map(table_name, parent_table, parent_fk_column) VALUES
  ('funnel_access_logs','funnels','funnel_id'),
  ('funnel_engagement_events','funnels','funnel_id'),
  ('funnel_engagement_sessions','funnels','funnel_id'),
  ('funnel_lead_form_config','funnels','funnel_id'),
  ('funnel_leads','funnels','funnel_id'),
  ('funnel_payments','funnels','funnel_id'),
  ('funnel_price_options','funnels','funnel_id'),
  ('funnel_step_progress','funnels','funnel_id'),
  ('funnel_steps','funnels','funnel_id'),
  ('funnel_video_analytics','funnels','funnel_id'),
  ('funnel_view_events','funnels','funnel_id'),
  ('link_events','funnels','funnel_id'),
  ('meta_pixel_events_log','funnels','funnel_id'),
  ('step_access_logs','funnels','funnel_id'),
  ('member_activity_log','funnels','funnel_id'),
-- Children of landing_pages
  ('landing_page_collaborators','landing_pages','landing_page_id'),
  ('landing_page_view_events','landing_pages','landing_page_id'),
  ('landing_page_view_logs','landing_pages','landing_page_id'),
-- Children of live_sessions
  ('live_registrations','live_sessions','session_id'),
  ('live_session_analytics','live_sessions','session_id'),
  ('live_session_heartbeats','live_sessions','session_id'),
  ('live_session_view_events','live_sessions','live_session_id'),
-- Children of video_assets
  ('video_asset_access','video_assets','video_id'),
  ('video_view_events','video_assets','video_id'),
  ('video_reactions','video_assets','video_id'),
-- Children of whatsapp_automations
  ('whatsapp_automation_enrollments','whatsapp_automations','automation_id'),
  ('whatsapp_automation_steps','whatsapp_automations','automation_id'),
  ('whatsapp_message_logs','whatsapp_automations','automation_id'),
  ('whatsapp_sequence_enrollments','whatsapp_automations','automation_id')
ON CONFLICT (table_name) DO UPDATE
  SET parent_table = EXCLUDED.parent_table,
      parent_fk_column = EXCLUDED.parent_fk_column;

------------------------------------------------------------------------
-- 2. Smart auto-fill trigger (replaces Phase 1 generic version)
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload  jsonb;
  v_ws       uuid;
  v_owner    uuid;
  v_user     uuid;
  v_parent   record;
  v_parent_id uuid;
BEGIN
  v_payload := to_jsonb(NEW);

  -- (a) caller-supplied wins
  v_ws := (v_payload->>'workspace_id')::uuid;
  IF v_ws IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- (b) GUC set by app middleware
  v_ws := public.current_workspace_id();
  IF v_ws IS NOT NULL THEN
    NEW.workspace_id := v_ws;
    RETURN NEW;
  END IF;

  -- (c) owner_id → membership lookup
  BEGIN v_owner := (v_payload->>'owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  IF v_owner IS NOT NULL THEN
    v_ws := public.resolve_user_workspace(v_owner);
    IF v_ws IS NOT NULL THEN
      NEW.workspace_id := v_ws;
      RETURN NEW;
    END IF;
  END IF;

  -- (d) user_id → membership lookup
  BEGIN v_user := (v_payload->>'user_id')::uuid; EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF v_user IS NOT NULL THEN
    v_ws := public.resolve_user_workspace(v_user);
    IF v_ws IS NOT NULL THEN
      NEW.workspace_id := v_ws;
      RETURN NEW;
    END IF;
  END IF;

  -- (e) parent FK lookup via _workspace_parent_map
  SELECT parent_table, parent_fk_column
    INTO v_parent
    FROM public._workspace_parent_map
   WHERE table_name = TG_TABLE_NAME;
  IF FOUND THEN
    BEGIN
      v_parent_id := (v_payload->>v_parent.parent_fk_column)::uuid;
    EXCEPTION WHEN OTHERS THEN v_parent_id := NULL; END;
    IF v_parent_id IS NOT NULL THEN
      EXECUTE format('SELECT workspace_id FROM public.%I WHERE id = $1', v_parent.parent_table)
        INTO v_ws USING v_parent_id;
      IF v_ws IS NOT NULL THEN
        NEW.workspace_id := v_ws;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- (f) last-resort safety net to keep NOT NULL safe during transition.
  --     Phase 3 will tighten this to RAISE EXCEPTION once app code reliably
  --     sets workspace_id and the legacy workspace is decomposed.
  NEW.workspace_id := public.legacy_workspace_id();
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tg_autofill_workspace_id() TO authenticated, anon, service_role;

-- Re-attach trigger to every tenant table (idempotent — replaces Phase 1 binding).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_autofill_workspace_id ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER tg_autofill_workspace_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_workspace_id()',
      r.table_name
    );
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 3. Flip workspace_id to NOT NULL on every tenant table
------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name = 'workspace_id'
       AND c.is_nullable = 'YES'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', r.table_name);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 4. RLS helper functions (additive, not yet attached to policies)
------------------------------------------------------------------------
-- Returns all workspaces the caller belongs to. Phase 3 policies will use
-- `workspace_id = ANY(my_workspace_ids())` style predicates.
CREATE OR REPLACE FUNCTION public.my_workspace_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(workspace_id), ARRAY[]::uuid[])
    FROM public.workspace_members
   WHERE user_id = auth.uid()
$$;

-- Convenience: does the caller share a workspace with the given workspace_id?
CREATE OR REPLACE FUNCTION public.same_workspace_as(_ws uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _ws IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.workspace_members
        WHERE workspace_id = _ws AND user_id = auth.uid()
     )
$$;

GRANT EXECUTE ON FUNCTION public.my_workspace_ids()       TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.same_workspace_as(uuid)  TO authenticated, anon, service_role;

------------------------------------------------------------------------
-- 5. NO policy changes in Phase 2 (deliberate — see header comment)
------------------------------------------------------------------------
-- Existing owner-based RLS policies remain the sole access control.
-- Phase 3 will:
--   (a) split `legacy` workspace into per-owner workspaces,
--   (b) atomically DROP owner-only policies and CREATE workspace-scoped
--       policies (USING same_workspace_as(workspace_id)),
--   (c) tighten the auto-fill trigger to RAISE on (f).

COMMIT;

-- =====================================================================
-- DONE. Run phase2_notnull_and_helpers_verify.sql to sanity-check.
-- =====================================================================
