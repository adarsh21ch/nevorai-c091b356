-- Diagnostics for landing page confirmation emails.
-- 1) Add a JSONB column for per-registration email send diagnostics.
-- 2) Ensure plan_config has correct rows for free/basic/pro.

ALTER TABLE public.landing_page_registrations
  ADD COLUMN IF NOT EXISTS email_send_log jsonb;

CREATE INDEX IF NOT EXISTS idx_landing_page_registrations_submitted_at
  ON public.landing_page_registrations (submitted_at DESC);

-- Sanity-check plan_config rows.
-- feature_landing_page_email: free=false, basic=true, pro=true.
INSERT INTO public.plan_config (plan_name, feature_landing_page_email)
VALUES
  ('free',  false),
  ('basic', true),
  ('pro',   true)
ON CONFLICT (plan_name) DO UPDATE
SET feature_landing_page_email = EXCLUDED.feature_landing_page_email;
