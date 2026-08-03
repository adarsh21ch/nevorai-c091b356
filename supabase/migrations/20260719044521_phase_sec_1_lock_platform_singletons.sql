-- =====================================================================
-- MIGRATION 1 / 3 — Lock down 5 platform-singleton config tables
-- Run in Supabase SQL editor. Review NOTICE output before applying MIG 2.
-- =====================================================================
-- Context: Phase 3 installed generic ws_select/ws_insert/ws_update/ws_delete
-- policies on EVERY table with a workspace_id column, including 5 tables
-- that hold platform-wide secrets / templates. Any of the 345 legacy-workspace
-- members can currently read/write these rows. This migration replaces those
-- policies with admin-only policies.
--
-- Tables:
--   payment_provider_settings, meta_pixel_settings, whatsapp_settings,
--   member_gateway_settings, whatsapp_templates
--
-- Rollback: phase_sec_1_lock_platform_singletons_rollback.sql
-- =====================================================================

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
                    WHERE table_schema='public' AND table_name=t) THEN
      RAISE NOTICE 'skip: table public.% not present', t; CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS ws_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete ON public.%I', t);

    EXECUTE format('DROP POLICY IF EXISTS admin_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_delete ON public.%I', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($f$
      CREATE POLICY admin_select ON public.%1$I
        FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY admin_insert ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (public.has_role(auth.uid(), 'admin'))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY admin_update ON public.%1$I
        FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin'))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY admin_delete ON public.%1$I
        FOR DELETE TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
    $f$, t);

    RAISE NOTICE 'locked: public.%', t;
  END LOOP;
END $$;

-- In-transaction verification
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '--- policies now on locked tables ---';
  FOR r IN
    SELECT tablename, policyname, cmd, roles::text
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('payment_provider_settings','meta_pixel_settings',
                         'whatsapp_settings','member_gateway_settings',
                         'whatsapp_templates')
     ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '  % / % / % / %', r.tablename, r.policyname, r.cmd, r.roles;
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- POST-DEPLOY: run as a non-admin authenticated user (impersonation):
--   SELECT count(*) FROM public.payment_provider_settings;  -- expect 0
--   SELECT count(*) FROM public.meta_pixel_settings;        -- expect 0
--   SELECT count(*) FROM public.whatsapp_settings;          -- expect 0
--   SELECT count(*) FROM public.member_gateway_settings;    -- expect 0
--   SELECT count(*) FROM public.whatsapp_templates;         -- expect 0
-- =====================================================================
