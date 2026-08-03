-- =====================================================================
-- Phase 1 — Verification queries (run AFTER applying phase1_tenant_columns.sql)
-- =====================================================================
-- Each query should return zero rows / the indicated value. If anything
-- is off, do NOT proceed to Phase 2.
-- =====================================================================

-- V1. Every tenant table has a workspace_id column. (Should equal expected count.)
SELECT count(*) AS tables_with_workspace_id
  FROM information_schema.columns
 WHERE table_schema='public' AND column_name='workspace_id'
   AND table_name NOT IN ('workspaces','workspace_members','workspace_branding');
-- Expected: 67 tenant tables (15 W-root + 15 W-user + 22 W-child + 6 WhatsApp shared + 2 pixel/payment + 4 member + 3 video-children)
-- If your count differs by ±2, that's fine — the value to verify against
-- is "the number of tenant tables in your decision list."

-- V2. No NULL workspace_id anywhere in tenant tables.
DO $$
DECLARE r record; bad int; total int := 0;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id IS NULL', r.table_name) INTO bad;
    IF bad > 0 THEN
      RAISE NOTICE 'NULL workspace_id in %: % rows', r.table_name, bad;
      total := total + bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'Total NULL workspace_id rows across all tenant tables: %', total;
END $$;
-- Expected NOTICE: "Total ... : 0"

-- V3. Every workspace_id points to a real workspace (FK trust, sanity).
DO $$
DECLARE r record; orphans int;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t LEFT JOIN public.workspaces w ON w.id = t.workspace_id WHERE w.id IS NULL',
      r.table_name) INTO orphans;
    IF orphans > 0 THEN
      RAISE NOTICE 'Orphan workspace_id in %: % rows', r.table_name, orphans;
    END IF;
  END LOOP;
END $$;
-- Expected: no NOTICE output.

-- V4. Row count parity vs known per-table counts (spot check).
SELECT 'funnels' AS t, count(*) FROM public.funnels                       -- expect 47
UNION ALL SELECT 'funnel_leads',           count(*) FROM public.funnel_leads          -- expect 1653
UNION ALL SELECT 'funnel_step_progress',   count(*) FROM public.funnel_step_progress  -- expect 791
UNION ALL SELECT 'video_assets',           count(*) FROM public.video_assets          -- expect 218
UNION ALL SELECT 'profiles',               count(*) FROM public.profiles              -- expect 287
UNION ALL SELECT 'user_subscriptions',     count(*) FROM public.user_subscriptions    -- expect 676
UNION ALL SELECT 'workspace_members',      count(*) FROM public.workspace_members;    -- expect 287 (=profiles)

-- V5. Funnel/landing/video parent FK consistency — child workspace must match parent.
SELECT 'funnel_leads' AS t, count(*) AS mismatch
  FROM public.funnel_leads c JOIN public.funnels p ON p.id = c.funnel_id
 WHERE c.workspace_id <> p.workspace_id
UNION ALL
SELECT 'funnel_steps', count(*)
  FROM public.funnel_steps c JOIN public.funnels p ON p.id = c.funnel_id
 WHERE c.workspace_id <> p.workspace_id
UNION ALL
SELECT 'landing_page_view_logs', count(*)
  FROM public.landing_page_view_logs c JOIN public.landing_pages p ON p.id = c.landing_page_id
 WHERE c.workspace_id <> p.workspace_id
UNION ALL
SELECT 'video_view_events', count(*)
  FROM public.video_view_events c JOIN public.video_assets p ON p.id = c.video_id
 WHERE c.workspace_id <> p.workspace_id;
-- Expected: all zeros.

-- V6. Trigger is attached to every tenant table.
SELECT count(*) AS triggers_installed
  FROM pg_trigger
 WHERE tgname = 'tg_autofill_workspace_id'
   AND NOT tgisinternal;
-- Expected: equals V1 count.

-- V7. Indexes exist.
SELECT count(*) AS workspace_indexes
  FROM pg_indexes
 WHERE schemaname='public'
   AND indexdef ILIKE '%workspace_id%';
-- Expected: ≥ V1 count (some tables have 2 indexes).
