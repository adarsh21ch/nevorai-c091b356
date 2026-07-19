-- ============================================================================
-- Phase 7 — Fix "infinite recursion detected in policy for relation
-- workspace_members".
--
-- Root cause: phaseA_applications.sql defined wm_select with an EXISTS
-- subquery that reads back from workspace_members itself. Any SELECT
-- against workspace_members that also triggers that policy check (e.g.
-- when RLS evaluates the subquery row-by-row against the same policy)
-- recurses.
--
-- Fix: reuse the existing SECURITY DEFINER helper
-- public.is_workspace_member(uuid) — defined in
-- phase0_workspaces_foundation.sql — which performs the same lookup
-- while bypassing RLS internally.
--
-- No schema change. No new functions. Same three OR'd conditions as
-- before, so visibility semantics are identical:
--   1. A user can always see their OWN membership rows.
--   2. Members of a workspace can see co-members of that workspace.
--   3. Platform admins can see every row.
--
-- Rollback: phase7_fix_workspace_members_recursion_rollback.sql
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS wm_select ON public.workspace_members;

CREATE POLICY wm_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_workspace_member(workspace_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification queries — run these AFTER the migration commits.
-- ---------------------------------------------------------------------------

-- 1. Confirm the new policy body is in place.
--
-- SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy
--  WHERE polrelid = 'public.workspace_members'::regclass
--    AND polname  = 'wm_select';
--
-- Expected using_expr should contain `is_workspace_member(workspace_id)`
-- and NO `FROM workspace_members me` subquery.

-- 2. Impersonation test — run as an ordinary authenticated user (NOT
--    service_role, NOT admin). Replace <SOME_USER_UUID> with a real
--    auth.users.id that has at least one workspace_members row.
--
--    Before the fix, the second query raises:
--      ERROR:  infinite recursion detected in policy for relation
--              "workspace_members"
--    After the fix, both queries return rows normally.
--
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claim.sub = '<SOME_USER_UUID>';
--
-- SELECT workspace_id, role
--   FROM public.workspace_members
--  WHERE user_id = auth.uid();
--
-- SELECT wm.workspace_id, wm.user_id, wm.role
--   FROM public.workspace_members wm
--   JOIN public.workspaces w ON w.id = wm.workspace_id
--  WHERE w.id IN (
--    SELECT workspace_id FROM public.workspace_members
--     WHERE user_id = auth.uid()
--  );
--
-- RESET ROLE;
