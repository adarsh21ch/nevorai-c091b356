-- Add OTP template config to whatsapp_settings so we can send OTP via an
-- approved Authentication template (required by Meta to initiate conversations
-- outside the 24-hour customer-service window).
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS otp_template_name TEXT DEFAULT 'nevorai_otp',
  ADD COLUMN IF NOT EXISTS otp_template_lang TEXT DEFAULT 'en';
