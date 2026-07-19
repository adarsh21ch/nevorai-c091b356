-- =====================================================================
-- Phase 2 — Rollback
-- =====================================================================
-- Reverses phase2_notnull_and_helpers.sql ONLY. Phase 1 columns, FKs,
-- and indexes remain. After this script:
--   * workspace_id is nullable again on every tenant table
--   * smart trigger reverts to the Phase 1 generic version
--   * Phase 2 RLS helpers and parent map are dropped
--
-- Apply ONLY if Phase 2 needs to be undone before Phase 3.

BEGIN;

-- 1. Flip workspace_id back to NULLABLE on every tenant table
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.column_name='workspace_id'
       AND c.is_nullable='NO'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id DROP NOT NULL', r.table_name);
  END LOOP;
END $$;

-- 2. Restore Phase 1's generic trigger function
CREATE OR REPLACE FUNCTION public.tg_autofill_workspace_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace_id();
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Drop Phase 2 helpers and parent map
DROP FUNCTION IF EXISTS public.same_workspace_as(uuid);
DROP FUNCTION IF EXISTS public.my_workspace_ids();
DROP TABLE    IF EXISTS public._workspace_parent_map;

COMMIT;
