-- =====================================================================
-- Phase 3 verification
-- =====================================================================

-- 1. No tenant rows left on legacy workspace
WITH t AS (
  SELECT c.table_name
    FROM information_schema.columns c
   WHERE c.table_schema='public' AND c.column_name='workspace_id'
     AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
), counts AS (
  SELECT table_name,
         (SELECT count(*) FROM public.workspaces w WHERE w.slug='legacy') AS _,
         (xpath('/row/c/text()',
           query_to_xml(format('SELECT count(*) AS c FROM public.%I WHERE workspace_id = public.legacy_workspace_id()', table_name),
           true, false, '')))[1]::text::bigint AS rows_on_legacy
    FROM t
)
SELECT table_name, rows_on_legacy
  FROM counts
 WHERE rows_on_legacy > 0
 ORDER BY rows_on_legacy DESC;
-- Expect: 0 rows (or only intentionally-shared tables).

-- 2. Every signed-up user has a non-legacy workspace where they're owner
SELECT u.id, u.email
  FROM auth.users u
 WHERE NOT EXISTS (
   SELECT 1 FROM public.workspace_members wm
     JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = u.id AND wm.role='owner' AND w.slug <> 'legacy'
 )
 LIMIT 50;
-- Expect: 0 rows.

-- 3. Every tenant table has the 4 ws_* policies
SELECT c.table_name,
       count(*) FILTER (WHERE p.policyname = 'ws_select') AS sel,
       count(*) FILTER (WHERE p.policyname = 'ws_insert') AS ins,
       count(*) FILTER (WHERE p.policyname = 'ws_update') AS upd,
       count(*) FILTER (WHERE p.policyname = 'ws_delete') AS del
  FROM information_schema.columns c
  LEFT JOIN pg_policies p
    ON p.schemaname='public' AND p.tablename = c.table_name
 WHERE c.table_schema='public' AND c.column_name='workspace_id'
   AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
 GROUP BY c.table_name
 HAVING count(*) FILTER (WHERE p.policyname IN ('ws_select','ws_insert','ws_update','ws_delete')) < 4
 ORDER BY c.table_name;
-- Expect: 0 rows.

-- 4. Anon-readable policies preserved (sample: public funnel/landing tables)
SELECT tablename, policyname, roles
  FROM pg_policies
 WHERE schemaname='public'
   AND 'anon' = ANY(roles)
 ORDER BY tablename, policyname;
-- Expect: existing public-read policies still present
-- (funnels, landing_pages, funnel_steps, video_assets, etc.)

-- 5. Trigger still attached to every tenant table
SELECT c.table_name
  FROM information_schema.columns c
 WHERE c.table_schema='public' AND c.column_name='workspace_id'
   AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
   AND NOT EXISTS (
     SELECT 1 FROM pg_trigger t
       JOIN pg_class cl ON cl.oid = t.tgrelid
      WHERE cl.relname = c.table_name AND t.tgname = 'tg_autofill_workspace_id'
   )
 ORDER BY c.table_name;
-- Expect: 0 rows.

-- 6. Helper functions present
SELECT proname
  FROM pg_proc
 WHERE proname IN ('slugify','primary_workspace_of','same_workspace_as','my_workspace_ids',
                   'resolve_user_workspace','legacy_workspace_id','tg_autofill_workspace_id')
 ORDER BY proname;
-- Expect: all 7 listed.
