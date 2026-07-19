-- =====================================================================
-- MIGRATION 2 / 3 — Re-parent per-user rows off the legacy workspace
-- Run AFTER phase_sec_1 succeeds and NOTICE output is reviewed.
-- =====================================================================
-- Resolves each row's owner workspace using the table's own ownership
-- column, then UPDATEs workspace_id. Rows without a resolvable owner
-- (e.g. whatsapp_conversations rows for phone numbers that never had a
-- lead created) are LEFT on legacy — the DO block reports counts so you
-- decide row-by-row.
--
-- Every prior value is saved in public._reparent_20260718_backup so the
-- rollback can restore.
--
-- Tables & resolution paths:
--   whatsapp_leads                : user_id
--   payment_audit_logs            : user_id
--   whatsapp_automations          : user_id
--   whatsapp_automation_steps     : automation_id -> automations.workspace_id
--   whatsapp_sequence_enrollments : automation_id -> automations.workspace_id
--   whatsapp_conversations        : phone_number -> whatsapp_leads.workspace_id
--   whatsapp_otp_codes            : phone_number -> whatsapp_leads.workspace_id
--   member_activity_log           : user_id
--   pixel_fire_log (non-platform) : owner_id, then resource_id -> funnel/landing
--   meta_pixel_events_log         : owner_id / user_id / pixel_id -> settings
--   team_connections              : owner_id / user_id / created_by
--
-- Rollback: phase_sec_2_reparent_from_legacy_rollback.sql
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public._reparent_20260718_backup (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  old_workspace_id uuid NOT NULL,
  new_workspace_id uuid NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);

DO $$
DECLARE
  v_legacy uuid := public.legacy_workspace_id();
  v_before bigint; v_after bigint; v_moved bigint;
  r record;
BEGIN
  RAISE NOTICE '--- MIGRATION 2: re-parent per-user tables (legacy=%) ---', v_legacy;

  -- Before-counts
  FOR r IN SELECT unnest(ARRAY[
      'whatsapp_conversations','whatsapp_otp_codes','payment_audit_logs',
      'whatsapp_leads','whatsapp_sequence_enrollments','whatsapp_automations',
      'whatsapp_automation_steps','member_activity_log','pixel_fire_log',
      'meta_pixel_events_log','team_connections']) AS tbl
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=r.tbl) THEN
      RAISE NOTICE '  skip missing table: %', r.tbl; CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1', r.tbl)
      INTO v_before USING v_legacy;
    RAISE NOTICE '  BEFORE %-32s : % rows on legacy', r.tbl, v_before;
  END LOOP;

  -- (A) whatsapp_leads via user_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_leads' AND column_name='user_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_leads', t.id, t.workspace_id, public.primary_workspace_of(t.user_id)
        FROM public.whatsapp_leads t
       WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
         AND public.primary_workspace_of(t.user_id) IS NOT NULL
      ON CONFLICT DO NOTHING;
    UPDATE public.whatsapp_leads t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_leads via user_id: %', v_moved;
  END IF;

  -- (B) payment_audit_logs via user_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='payment_audit_logs' AND column_name='user_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'payment_audit_logs', t.id, t.workspace_id, public.primary_workspace_of(t.user_id)
        FROM public.payment_audit_logs t
       WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
         AND public.primary_workspace_of(t.user_id) IS NOT NULL
      ON CONFLICT DO NOTHING;
    UPDATE public.payment_audit_logs t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved payment_audit_logs via user_id: %', v_moved;
  END IF;

  -- (C) whatsapp_automations via user_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_automations' AND column_name='user_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_automations', t.id, t.workspace_id, public.primary_workspace_of(t.user_id)
        FROM public.whatsapp_automations t
       WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
         AND public.primary_workspace_of(t.user_id) IS NOT NULL
      ON CONFLICT DO NOTHING;
    UPDATE public.whatsapp_automations t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_automations via user_id: %', v_moved;
  END IF;

  -- (D) whatsapp_automation_steps via automation_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_automation_steps' AND column_name='automation_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_automation_steps', s.id, s.workspace_id, a.workspace_id
        FROM public.whatsapp_automation_steps s
        JOIN public.whatsapp_automations a ON a.id=s.automation_id
       WHERE s.workspace_id=v_legacy AND a.workspace_id<>v_legacy
      ON CONFLICT DO NOTHING;
    UPDATE public.whatsapp_automation_steps s SET workspace_id=a.workspace_id
      FROM public.whatsapp_automations a
     WHERE s.automation_id=a.id AND s.workspace_id=v_legacy AND a.workspace_id<>v_legacy;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_automation_steps via automation: %', v_moved;
  END IF;

  -- (E) whatsapp_sequence_enrollments via automation_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_sequence_enrollments' AND column_name='automation_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_sequence_enrollments', s.id, s.workspace_id, a.workspace_id
        FROM public.whatsapp_sequence_enrollments s
        JOIN public.whatsapp_automations a ON a.id=s.automation_id
       WHERE s.workspace_id=v_legacy AND a.workspace_id<>v_legacy
      ON CONFLICT DO NOTHING;
    UPDATE public.whatsapp_sequence_enrollments s SET workspace_id=a.workspace_id
      FROM public.whatsapp_automations a
     WHERE s.automation_id=a.id AND s.workspace_id=v_legacy AND a.workspace_id<>v_legacy;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_sequence_enrollments via automation: %', v_moved;
  END IF;

  -- (F) whatsapp_conversations via phone_number -> whatsapp_leads
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_conversations' AND column_name='phone_number')
     AND EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_leads' AND column_name='phone_number') THEN
    WITH resolved AS (
      SELECT DISTINCT ON (c.id) c.id AS cid, c.workspace_id AS old_ws, l.workspace_id AS new_ws
        FROM public.whatsapp_conversations c
        JOIN public.whatsapp_leads l ON l.phone_number=c.phone_number
       WHERE c.workspace_id=v_legacy AND l.workspace_id<>v_legacy
       ORDER BY c.id, l.updated_at DESC NULLS LAST
    )
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_conversations', cid, old_ws, new_ws FROM resolved
      ON CONFLICT DO NOTHING;
    WITH resolved AS (
      SELECT DISTINCT ON (c.id) c.id AS cid, l.workspace_id AS new_ws
        FROM public.whatsapp_conversations c
        JOIN public.whatsapp_leads l ON l.phone_number=c.phone_number
       WHERE c.workspace_id=v_legacy AND l.workspace_id<>v_legacy
       ORDER BY c.id, l.updated_at DESC NULLS LAST
    )
    UPDATE public.whatsapp_conversations c SET workspace_id=r.new_ws
      FROM resolved r WHERE c.id=r.cid;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_conversations via phone_number: %', v_moved;
  END IF;

  -- (G) whatsapp_otp_codes via phone_number -> whatsapp_leads
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='whatsapp_otp_codes' AND column_name='phone_number') THEN
    WITH resolved AS (
      SELECT DISTINCT ON (o.id) o.id AS oid, o.workspace_id AS old_ws, l.workspace_id AS new_ws
        FROM public.whatsapp_otp_codes o
        JOIN public.whatsapp_leads l ON l.phone_number=o.phone_number
       WHERE o.workspace_id=v_legacy AND l.workspace_id<>v_legacy
       ORDER BY o.id, l.updated_at DESC NULLS LAST
    )
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'whatsapp_otp_codes', oid, old_ws, new_ws FROM resolved
      ON CONFLICT DO NOTHING;
    WITH resolved AS (
      SELECT DISTINCT ON (o.id) o.id AS oid, l.workspace_id AS new_ws
        FROM public.whatsapp_otp_codes o
        JOIN public.whatsapp_leads l ON l.phone_number=o.phone_number
       WHERE o.workspace_id=v_legacy AND l.workspace_id<>v_legacy
       ORDER BY o.id, l.updated_at DESC NULLS LAST
    )
    UPDATE public.whatsapp_otp_codes o SET workspace_id=r.new_ws
      FROM resolved r WHERE o.id=r.oid;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved whatsapp_otp_codes via phone_number: %', v_moved;
  END IF;

  -- (H) member_activity_log via user_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='member_activity_log' AND column_name='user_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'member_activity_log', t.id, t.workspace_id, public.primary_workspace_of(t.user_id)
        FROM public.member_activity_log t
       WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
         AND public.primary_workspace_of(t.user_id) IS NOT NULL
      ON CONFLICT DO NOTHING;
    UPDATE public.member_activity_log t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved member_activity_log via user_id: %', v_moved;
  END IF;

  -- (I) pixel_fire_log — NON-platform only (funnel / landing)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='pixel_fire_log' AND column_name='owner_id') THEN
    INSERT INTO public._reparent_20260718_backup(table_name,row_id,old_workspace_id,new_workspace_id)
      SELECT 'pixel_fire_log', t.id, t.workspace_id, public.primary_workspace_of(t.owner_id)
        FROM public.pixel_fire_log t
       WHERE t.workspace_id=v_legacy AND t.scope IN ('funnel','landing')
         AND t.owner_id IS NOT NULL
         AND public.primary_workspace_of(t.owner_id) IS NOT NULL
      ON CONFLICT DO NOTHING;
    UPDATE public.pixel_fire_log t SET workspace_id=public.primary_workspace_of(t.owner_id)
     WHERE t.workspace_id=v_legacy AND t.scope IN ('funnel','landing')
       AND t.owner_id IS NOT NULL
       AND public.primary_workspace_of(t.owner_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved pixel_fire_log via owner_id: %', v_moved;

    UPDATE public.pixel_fire_log t SET workspace_id=f.workspace_id
      FROM public.funnels f
     WHERE t.workspace_id=v_legacy AND t.scope='funnel'
       AND t.resource_id=f.id AND f.workspace_id<>v_legacy;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved pixel_fire_log via funnel resource: %', v_moved;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='landing_pages') THEN
      UPDATE public.pixel_fire_log t SET workspace_id=lp.workspace_id
        FROM public.landing_pages lp
       WHERE t.workspace_id=v_legacy AND t.scope='landing'
         AND t.resource_id=lp.id AND lp.workspace_id<>v_legacy;
      GET DIAGNOSTICS v_moved=ROW_COUNT;
      RAISE NOTICE '  moved pixel_fire_log via landing resource: %', v_moved;
    END IF;
  END IF;

  -- (J) meta_pixel_events_log
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='meta_pixel_events_log' AND column_name='owner_id') THEN
    UPDATE public.meta_pixel_events_log t SET workspace_id=public.primary_workspace_of(t.owner_id)
     WHERE t.workspace_id=v_legacy AND t.owner_id IS NOT NULL
       AND public.primary_workspace_of(t.owner_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved meta_pixel_events_log via owner_id: %', v_moved;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='meta_pixel_events_log' AND column_name='user_id') THEN
    UPDATE public.meta_pixel_events_log t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved meta_pixel_events_log via user_id: %', v_moved;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='meta_pixel_events_log' AND column_name='pixel_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='meta_pixel_settings') THEN
    UPDATE public.meta_pixel_events_log t SET workspace_id=mps.workspace_id
      FROM public.meta_pixel_settings mps
     WHERE t.workspace_id=v_legacy AND t.pixel_id=mps.pixel_id
       AND mps.workspace_id<>v_legacy;
    GET DIAGNOSTICS v_moved=ROW_COUNT;
    RAISE NOTICE '  moved meta_pixel_events_log via pixel_id: %', v_moved;
  END IF;

  -- (K) team_connections
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='team_connections' AND column_name='owner_id') THEN
    UPDATE public.team_connections t SET workspace_id=public.primary_workspace_of(t.owner_id)
     WHERE t.workspace_id=v_legacy AND t.owner_id IS NOT NULL
       AND public.primary_workspace_of(t.owner_id) IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='team_connections' AND column_name='user_id') THEN
    UPDATE public.team_connections t SET workspace_id=public.primary_workspace_of(t.user_id)
     WHERE t.workspace_id=v_legacy AND t.user_id IS NOT NULL
       AND public.primary_workspace_of(t.user_id) IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='team_connections' AND column_name='created_by') THEN
    UPDATE public.team_connections t SET workspace_id=public.primary_workspace_of(t.created_by)
     WHERE t.workspace_id=v_legacy AND t.created_by IS NOT NULL
       AND public.primary_workspace_of(t.created_by) IS NOT NULL;
  END IF;

  -- Stranded report
  RAISE NOTICE '--- STRANDED ROWS still on legacy (need manual decision) ---';
  FOR r IN SELECT unnest(ARRAY[
      'whatsapp_conversations','whatsapp_otp_codes','payment_audit_logs',
      'whatsapp_leads','whatsapp_sequence_enrollments','whatsapp_automations',
      'whatsapp_automation_steps','member_activity_log','pixel_fire_log',
      'meta_pixel_events_log','team_connections']) AS tbl
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=r.tbl) THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1', r.tbl)
      INTO v_after USING v_legacy;
    RAISE NOTICE '  STRANDED %-32s : %', r.tbl, v_after;
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- FOLLOW-UP: inspect stranded rows and decide reassign / delete / leave.
-- Example:
--   SELECT scope, count(*) FROM public.pixel_fire_log
--    WHERE workspace_id = public.legacy_workspace_id() GROUP BY 1;
--   SELECT phone_number, count(*) FROM public.whatsapp_conversations
--    WHERE workspace_id = public.legacy_workspace_id()
--    GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
-- =====================================================================
