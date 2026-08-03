-- Run this in Supabase SQL editor.
-- Custom Form Fields builder + plan gating

ALTER TABLE public.funnel_lead_form_config
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.funnel_leads
  ADD COLUMN IF NOT EXISTS custom_field_values jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.plan_config
  ADD COLUMN IF NOT EXISTS feature_custom_form_fields boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_custom_form_fields integer NOT NULL DEFAULT 0;

UPDATE public.plan_config
  SET feature_custom_form_fields = false, max_custom_form_fields = 0
  WHERE plan_name = 'free';

UPDATE public.plan_config
  SET feature_custom_form_fields = true, max_custom_form_fields = 2
  WHERE plan_name = 'basic';

UPDATE public.plan_config
  SET feature_custom_form_fields = true, max_custom_form_fields = -1
  WHERE plan_name IN ('pro', 'enterprise');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_config_max_custom_form_fields_valid') THEN
    ALTER TABLE public.plan_config
      ADD CONSTRAINT plan_config_max_custom_form_fields_valid
      CHECK (max_custom_form_fields = -1 OR max_custom_form_fields >= 0);
  END IF;
END $$;
