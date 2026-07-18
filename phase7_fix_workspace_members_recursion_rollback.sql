-- ============================================================================
-- Rollback for phase7_fix_workspace_members_recursion.sql
--
-- Restores the original wm_select policy from phaseA_applications.sql,
-- including the self-referential EXISTS subquery. Only run this if the
-- new policy is causing an unexpected behaviour change — it will
-- reintroduce the "infinite recursion detected in policy for relation
-- workspace_members" error on affected query paths.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS wm_select ON public.workspace_members;

CREATE POLICY wm_select ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members me
       WHERE me.workspace_id = workspace_members.workspace_id
         AND me.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

COMMIT;
