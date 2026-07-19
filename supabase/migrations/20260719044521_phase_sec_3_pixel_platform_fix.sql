-- =====================================================================
-- MIGRATION 3 / 3 — pixel_fire_log platform-scope insert path
-- Run AFTER phase_sec_2 succeeds and stranded-rows report is reviewed.
-- =====================================================================
-- Since Phase 3, tg_autofill_workspace_id() RAISEs when it cannot resolve
-- a workspace_id, and pixel_fire_log with scope='platform' has no owner_id,
-- no user_id, no parent map, and inserts often come from anon browser
-- sessions (no auth.uid()). Result: 100% of platform-scope inserts have
-- been failing for ~18 days.
--
-- Fix:
--   1. Ensure a dedicated "system" workspace (slug='system'). Zero members
--      so no accidental exposure via same_workspace_as().
--   2. Extend tg_autofill_workspace_id() with one targeted final branch:
--      if TG_TABLE_NAME='pixel_fire_log' AND NEW.scope='platform' →
--      route to system workspace. All other tables keep strict behaviour.
--   3. Backfill any existing legacy-hosted platform rows to system.
--   4. Add an admin-only SELECT policy so admins can still inspect these
--      rows (regular ws_select won't match — no one is a system member).
--
-- Rollback: phase_sec_3_pixel_platform_fix_rollback.sql
-- =====================================================================

BEGIN;

-- 1. System workspace (idempotent)
INSERT INTO public.workspaces(slug, name, status, plan)
  SELECT 'system', 'System (platform telemetry)', 'active', 'free'
   WHERE NOT EXISTS (SELECT 1 FROM public.workspaces WHERE slug='system');

CREATE OR REPLACE FUNCTION public.system_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.workspaces WHERE slug='system' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.system_workspace_id() TO authenticated, anon, service_role;

-- 2. Trigger with platform fallback
CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payload jsonb := to_jsonb(NEW);
  v_ws uuid;
  v_owner uuid; v_user uuid;
  v_parent record; v_parent_id uuid;
  v_scope text;
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
    FROM public._workspace_parent_map WHERE table_name=TG_TABLE_NAME;
  IF FOUND THEN
    BEGIN v_parent_id := (v_payload->>v_parent.parent_fk_column)::uuid;
    EXCEPTION WHEN OTHERS THEN v_parent_id := NULL; END;
    IF v_parent_id IS NOT NULL THEN
      EXECUTE format('SELECT workspace_id FROM public.%I WHERE id=$1', v_parent.parent_table)
        INTO v_ws USING v_parent_id;
      IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_ws := public.primary_workspace_of(auth.uid());
    IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
  END IF;

  -- Targeted fallback for platform-scope pixel telemetry
  IF TG_TABLE_NAME='pixel_fire_log' THEN
    BEGIN v_scope := v_payload->>'scope'; EXCEPTION WHEN OTHERS THEN v_scope := NULL; END;
    IF v_scope='platform' THEN
      v_ws := public.system_workspace_id();
      IF v_ws IS NOT NULL THEN NEW.workspace_id := v_ws; RETURN NEW; END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'tg_autofill_workspace_id: cannot resolve workspace_id for table % (no owner/user/parent/session)', TG_TABLE_NAME;
END;
$$;

-- 3. Backfill existing legacy-hosted platform rows
UPDATE public.pixel_fire_log
   SET workspace_id = public.system_workspace_id()
 WHERE workspace_id = public.legacy_workspace_id()
   AND scope = 'platform';

-- 4. Admin visibility for system-workspace pixel rows
DROP POLICY IF EXISTS admin_view_system_pixel_fires ON public.pixel_fire_log;
CREATE POLICY admin_view_system_pixel_fires ON public.pixel_fire_log
  FOR SELECT TO authenticated
  USING (
    workspace_id = public.system_workspace_id()
    AND public.has_role(auth.uid(), 'admin')
  );

COMMIT;

-- =====================================================================
-- POST-DEPLOY TEST:
--
--   INSERT INTO public.pixel_fire_log(scope, event_name, success)
--     VALUES ('platform', 'test_platform_insert', true)
--     RETURNING id, workspace_id, scope;
--   -- expect: no exception, workspace_id = system-workspace id
--
--   SELECT id, workspace_id FROM public.pixel_fire_log
--    WHERE event_name='test_platform_insert';
--
--   DELETE FROM public.pixel_fire_log WHERE event_name='test_platform_insert';
--
-- FINAL VERIFICATION (as non-admin authenticated user impersonation):
--   SELECT count(*) FROM public.payment_provider_settings;   -- expect 0
--   SELECT count(*) FROM public.meta_pixel_settings;         -- expect 0
--   SELECT count(*) FROM public.whatsapp_settings;           -- expect 0
--   SELECT count(*) FROM public.member_gateway_settings;     -- expect 0
--   SELECT count(*) FROM public.whatsapp_templates;          -- expect 0
--   SELECT count(*) FROM public.whatsapp_leads
--     WHERE user_id <> auth.uid();                           -- expect 0
--   SELECT count(*) FROM public.payment_audit_logs
--     WHERE user_id <> auth.uid();                           -- expect 0
-- =====================================================================
