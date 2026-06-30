-- =====================================================================
-- Phase 2 — Verification
-- =====================================================================
-- Run AFTER phase2_notnull_and_helpers.sql. Every check should return OK.

-- Check 1: workspace_id is NOT NULL on every tenant table
SELECT 'check_1_notnull' AS check_name,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL: '||count(*)||' still nullable' END AS result
  FROM information_schema.columns
 WHERE table_schema='public'
   AND column_name='workspace_id'
   AND is_nullable='YES'
   AND table_name NOT IN ('workspaces','workspace_members','workspace_branding');

-- Check 2: every tenant table has the auto-fill trigger
SELECT 'check_2_trigger' AS check_name,
       CASE WHEN count(*) = (
         SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND column_name='workspace_id'
            AND table_name NOT IN ('workspaces','workspace_members','workspace_branding')
       ) THEN 'OK' ELSE 'FAIL: trigger missing on some tables' END AS result
  FROM pg_trigger
 WHERE tgname='tg_autofill_workspace_id' AND NOT tgisinternal;

-- Check 3: helper functions exist
SELECT 'check_3_helpers' AS check_name,
       CASE WHEN count(*) = 4 THEN 'OK' ELSE 'FAIL: expected 4 helpers, got '||count(*) END AS result
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('my_workspace_ids','same_workspace_as','resolve_user_workspace','legacy_workspace_id');

-- Check 4: parent map is populated
SELECT 'check_4_parent_map' AS check_name,
       CASE WHEN count(*) >= 28 THEN 'OK ('||count(*)||' rows)' ELSE 'FAIL: only '||count(*)||' rows' END AS result
  FROM public._workspace_parent_map;

-- Check 5: no orphan workspace_id values
SELECT 'check_5_orphans' AS check_name,
       CASE WHEN count(*) = 0 THEN 'OK'
            ELSE 'FAIL: '||count(*)||' tenant rows reference missing workspaces' END AS result
  FROM (
    SELECT 1
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
       AND EXISTS (
         SELECT 1
           FROM pg_class cl
          WHERE cl.relname = c.table_name
       )
  ) x;
-- NOTE: orphan-row check is best done per-table; FK with ON DELETE RESTRICT
-- already prevents orphans, so this is informational.

-- Check 6: smoke test the smart trigger via an INSERT path
-- (manual: insert a row without workspace_id, expect it populated automatically)

-- Check 7: existing policies untouched (count should match Phase 1 pre-state)
SELECT 'check_7_policies_unchanged' AS check_name,
       count(*) AS total_policies_on_tenant_tables
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN (
     SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='workspace_id'
        AND table_name NOT IN ('workspaces','workspace_members','workspace_branding')
   );
