-- Run this in Supabase SQL editor.
-- Custom registration fields + per-field required toggles for Live Sessions

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS name_required  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city_required  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_fields  jsonb   NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.live_registrations
  ADD COLUMN IF NOT EXISTS custom_field_values jsonb NOT NULL DEFAULT '{}'::jsonb;
