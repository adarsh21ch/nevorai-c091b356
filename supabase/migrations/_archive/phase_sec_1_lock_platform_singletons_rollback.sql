-- Rollback for phase_sec_1 — restores Phase 3 workspace-scoped policies
-- on the 5 platform-singleton config tables. WARNING: this re-opens the
-- exposure to all legacy-workspace members.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'payment_provider_settings',
    'meta_pixel_settings',
    'whatsapp_settings',
    'member_gateway_settings',
    'whatsapp_templates'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=t) THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS admin_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_delete ON public.%I', t);
    EXECUTE format($f$CREATE POLICY ws_select ON public.%1$I FOR SELECT TO authenticated USING (public.same_workspace_as(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY ws_insert ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.same_workspace_as(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY ws_update ON public.%1$I FOR UPDATE TO authenticated USING (public.same_workspace_as(workspace_id)) WITH CHECK (public.same_workspace_as(workspace_id))$f$, t);
    EXECUTE format($f$CREATE POLICY ws_delete ON public.%1$I FOR DELETE TO authenticated USING (public.same_workspace_as(workspace_id))$f$, t);
  END LOOP;
END $$;

COMMIT;
