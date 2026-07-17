-- ============================================================================
-- Consolidate deprecated feature flags on subscription_plans.
-- Idempotent. Run in Supabase SQL editor.
--
-- Goal 1: feature_prospect_analytics / feature_insights / feature_team_analytics
--         are deprecated; code now derives them from feature_advanced_analytics.
--         Columns are LEFT IN PLACE (unused) for one release cycle.
--
-- Goal 2: feature_speaker_profile / feature_video_topics / feature_contact_form
--         / feature_privacy_settings / feature_custom_form_fields are collapsed
--         into a single new column feature_advanced_funnel_customization.
--         Old columns LEFT IN PLACE (unused) for one release cycle.
--
-- Goal 3: view_limit_mode DDL unchanged (enforcement code untouched).
-- ============================================================================

BEGIN;

-- 1) New consolidated funnel-customization flag.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS feature_advanced_funnel_customization boolean NOT NULL DEFAULT false;

-- 2) Backfill: TRUE if ANY of the 5 legacy flags is true on that plan.
UPDATE public.subscription_plans
   SET feature_advanced_funnel_customization = (
        COALESCE(feature_speaker_profile,    false)
     OR COALESCE(feature_video_topics,       false)
     OR COALESCE(feature_contact_form,       false)
     OR COALESCE(feature_privacy_settings,   false)
     OR COALESCE(feature_custom_form_fields, false)
   );

-- 3) Report the derived values so admins can confirm.
SELECT plan_name,
       feature_advanced_funnel_customization AS new_flag,
       feature_speaker_profile   AS old_speaker,
       feature_video_topics      AS old_topics,
       feature_contact_form      AS old_contact,
       feature_privacy_settings  AS old_privacy,
       feature_custom_form_fields AS old_custom
  FROM public.subscription_plans
 ORDER BY display_order;

COMMIT;
