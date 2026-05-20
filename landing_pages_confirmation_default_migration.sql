-- Ensure landing pages always default to sending the prospect confirmation
-- email, and backfill any legacy rows where the toggle was never set (NULL).
-- The send-landing-page-confirmation edge function treats NULL as "disabled"
-- because of `if (!page.send_confirmation_email)`, so unmigrated pages
-- silently skip the email. Safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'landing_pages'
      AND column_name = 'send_confirmation_email'
  ) THEN
    EXECUTE 'ALTER TABLE public.landing_pages ALTER COLUMN send_confirmation_email SET DEFAULT true';
    EXECUTE 'UPDATE public.landing_pages SET send_confirmation_email = true WHERE send_confirmation_email IS NULL';
  END IF;
END $$;
