-- Fix: admin_review_kyc RPC missing from schema cache.
-- The AdminKYCPage calls supabase.rpc('admin_review_kyc', ...) but the function
-- was never applied to this database. This file (re)creates it idempotently.
--
-- Run this in the Supabase SQL editor.

BEGIN;

-- Safety: make sure the columns the RPC writes to actually exist.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by     uuid,
  ADD COLUMN IF NOT EXISTS kyc_status      text,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  _submission_id uuid,
  _action        text,          -- 'approved' | 'rejected'
  _reason        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_id uuid;
  _admin   uuid := auth.uid();
BEGIN
  IF NOT public.has_role(_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  UPDATE public.user_kyc_submissions
     SET status            = _action,
         reviewed_at       = now(),
         reviewed_by       = _admin,
         rejection_reason  = CASE WHEN _action = 'rejected' THEN _reason ELSE NULL END
   WHERE id = _submission_id
   RETURNING user_id INTO _user_id;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'submission not found';
  END IF;

  IF _action = 'approved' THEN
    UPDATE public.profiles
       SET kyc_status      = 'verified',
           kyc_verified_at = now(),
           is_verified     = true,
           verified_at     = now(),
           verified_by     = _admin
     WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
       SET kyc_status      = 'rejected',
           kyc_verified_at = NULL
     WHERE id = _user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_kyc(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(uuid, text, text) TO authenticated;

-- Force PostgREST to reload the schema cache so the RPC is callable immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
