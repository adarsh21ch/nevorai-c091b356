-- =====================================================================
-- Consolidate to the final 3-tier system: Starter, Growth, Leader
-- Run this in the Supabase SQL Editor.
--
-- Before:  free, basic, starter, growth, pro, team, leader (mixed legacy)
-- After :  starter, growth, leader   (single row each, clean display names)
-- =====================================================================

BEGIN;

-- 1. Migrate any user_subscriptions still pointing at legacy tiers ------
UPDATE public.user_subscriptions SET tier = 'starter' WHERE tier = 'basic';
UPDATE public.user_subscriptions SET tier = 'growth'  WHERE tier = 'pro';
UPDATE public.user_subscriptions SET tier = 'leader'  WHERE tier = 'team';

-- Same for profiles.subscription_tier IF that column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='subscription_tier'
  ) THEN
    EXECUTE $sql$UPDATE public.profiles SET subscription_tier = 'starter' WHERE subscription_tier = 'basic'$sql$;
    EXECUTE $sql$UPDATE public.profiles SET subscription_tier = 'growth'  WHERE subscription_tier = 'pro'$sql$;
    EXECUTE $sql$UPDATE public.profiles SET subscription_tier = 'leader'  WHERE subscription_tier = 'team'$sql$;
  END IF;
END $$;

-- 2. Migrate plan_tiers rows to the canonical plan_name ----------------
UPDATE public.plan_tiers SET plan_name = 'starter' WHERE plan_name = 'basic';
UPDATE public.plan_tiers SET plan_name = 'growth'  WHERE plan_name = 'pro';
UPDATE public.plan_tiers SET plan_name = 'leader'  WHERE plan_name = 'team';

-- 3. Merge duplicate subscription_plans rows ---------------------------
-- If both a legacy and canonical row exist, keep the canonical one and
-- delete the legacy row. If only the legacy row exists, rename it.

-- basic -> starter
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'starter')
     AND EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'basic') THEN
    DELETE FROM public.subscription_plans WHERE plan_name = 'basic';
  ELSIF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'basic') THEN
    UPDATE public.subscription_plans SET plan_name = 'starter' WHERE plan_name = 'basic';
  END IF;
END $$;

-- pro -> growth
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'growth')
     AND EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'pro') THEN
    DELETE FROM public.subscription_plans WHERE plan_name = 'pro';
  ELSIF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'pro') THEN
    UPDATE public.subscription_plans SET plan_name = 'growth' WHERE plan_name = 'pro';
  END IF;
END $$;

-- team -> leader
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'leader')
     AND EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'team') THEN
    DELETE FROM public.subscription_plans WHERE plan_name = 'team';
  ELSIF EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_name = 'team') THEN
    UPDATE public.subscription_plans SET plan_name = 'leader' WHERE plan_name = 'team';
  END IF;
END $$;

-- 4. Hide the legacy "free" plan (don't delete — keep for history) -----
UPDATE public.subscription_plans
   SET is_enabled = false,
       is_visible = false,
       is_purchasable = false
 WHERE plan_name = 'free';

-- 5. Force canonical display names + ordering --------------------------
UPDATE public.subscription_plans
   SET display_name = 'Starter',
       display_order = 1,
       is_enabled = true,
       plan_badge_text = COALESCE(NULLIF(plan_badge_text,''), 'For Beginners')
 WHERE plan_name = 'starter';

UPDATE public.subscription_plans
   SET display_name = 'Growth',
       display_order = 2,
       is_enabled = true,
       plan_badge_text = 'Most Popular'
 WHERE plan_name = 'growth';

UPDATE public.subscription_plans
   SET display_name = 'Leader',
       display_order = 3,
       is_enabled = true,
       plan_badge_text = COALESCE(NULLIF(plan_badge_text,''), 'For Teams')
 WHERE plan_name = 'leader';

-- 6. Sanity check ------------------------------------------------------
-- Should return exactly 3 enabled rows: starter, growth, leader
SELECT plan_name, display_name, display_order, is_enabled, is_visible
  FROM public.subscription_plans
 WHERE is_enabled = true
 ORDER BY display_order;

COMMIT;
