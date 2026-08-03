-- =====================================================================
-- Phase 1 — Rollback
-- =====================================================================
-- Drops every workspace_id column, FK, index, and trigger added by
-- phase1_tenant_columns.sql. Leaves Phase 0 (workspaces, members,
-- branding, reserved_subdomains, helper functions) intact.
--
-- This is destructive of the new column data only. Original tables and
-- existing RLS policies are untouched.
-- =====================================================================

BEGIN;

-- 1. Drop the auto-fill trigger from every tenant table.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_autofill_workspace_id ON public.%I', r.table_name);
  END LOOP;
END $$;

-- 2. Drop the workspace_id column from every tenant table (cascades index+FK).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.column_name='workspace_id'
       AND c.table_name NOT IN ('workspaces','workspace_members','workspace_branding')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS workspace_id', r.table_name);
  END LOOP;
END $$;

-- 3. Drop helper functions added in Phase 1.
DROP FUNCTION IF EXISTS public.tg_autofill_workspace_id();
DROP FUNCTION IF EXISTS public.resolve_user_workspace(uuid);
DROP FUNCTION IF EXISTS public.legacy_workspace_id();

COMMIT;
