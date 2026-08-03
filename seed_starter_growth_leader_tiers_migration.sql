-- ============================================================================
-- Seed base tiers for the consolidated 3-tier system (starter, growth, leader)
-- Run in Supabase SQL editor. Idempotent.
--
-- Fixes the "Subscribe to Starter ₹0/mo — Invalid or inactive plan" bug:
--
--  * subscription_plans has starter / growth / leader rows but plan_tiers may
--    still hold legacy basic / pro / team rows OR have no is_base flag,
--    which makes withBasePrice() return 0 and blocks checkout.
--  * Checkout now reads subscription_plans directly, but the base tier is
--    still needed for the INR price + daily view allowance.
-- ============================================================================

BEGIN;

-- 1) Rename any residual legacy plan_tiers rows to the new names.
UPDATE public.plan_tiers SET plan_name = 'starter' WHERE plan_name = 'basic';
UPDATE public.plan_tiers SET plan_name = 'growth'  WHERE plan_name = 'pro';
UPDATE public.plan_tiers SET plan_name = 'leader'  WHERE plan_name = 'team';

-- 2) For every enabled plan (starter/growth/leader), guarantee ONE active
--    base tier flagged is_base = true. If none exists, promote the lowest
--    daily_views active tier. If no active tier exists at all, seed one
--    from subscription_plans.monthly_price / yearly_price.
DO $$
DECLARE
  p RECORD;
  v_tier_id uuid;
BEGIN
  FOR p IN
    SELECT plan_name, monthly_price, yearly_price
      FROM public.subscription_plans
     WHERE plan_name IN ('starter','growth','leader')
       AND COALESCE(is_enabled, true) = true
  LOOP
    -- If a base tier already exists and is active, keep it.
    SELECT id INTO v_tier_id
      FROM public.plan_tiers
     WHERE plan_name = p.plan_name
       AND is_base = true
       AND is_active = true
     LIMIT 1;

    IF v_tier_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Otherwise, promote the lowest-daily-views active tier to base.
    SELECT id INTO v_tier_id
      FROM public.plan_tiers
     WHERE plan_name = p.plan_name
       AND is_active = true
     ORDER BY daily_views ASC NULLS LAST, monthly_price ASC NULLS LAST
     LIMIT 1;

    IF v_tier_id IS NOT NULL THEN
      -- Ensure only one is_base per plan.
      UPDATE public.plan_tiers SET is_base = false
       WHERE plan_name = p.plan_name AND is_base = true;
      UPDATE public.plan_tiers SET is_base = true WHERE id = v_tier_id;
      CONTINUE;
    END IF;

    -- No tier at all — synthesize a base tier from subscription_plans price.
    INSERT INTO public.plan_tiers
      (plan_name, daily_views, monthly_price, yearly_price, is_base, is_active)
    VALUES
      (
        p.plan_name,
        CASE p.plan_name
          WHEN 'starter' THEN 20
          WHEN 'growth'  THEN 200
          WHEN 'leader'  THEN 2000
        END,
        COALESCE(NULLIF(p.monthly_price, 0), CASE p.plan_name
          WHEN 'starter' THEN 149
          WHEN 'growth'  THEN 599
          WHEN 'leader'  THEN 1999
        END),
        COALESCE(NULLIF(p.yearly_price, 0), CASE p.plan_name
          WHEN 'starter' THEN 1490
          WHEN 'growth'  THEN 5990
          WHEN 'leader'  THEN 19990
        END),
        true,
        true
      );
  END LOOP;
END $$;

-- 3) Ensure subscription_plans itself has non-zero INR prices as a fallback.
UPDATE public.subscription_plans SET monthly_price = 149,  yearly_price = 1490
 WHERE plan_name = 'starter' AND (monthly_price IS NULL OR monthly_price = 0);
UPDATE public.subscription_plans SET monthly_price = 599,  yearly_price = 5990
 WHERE plan_name = 'growth'  AND (monthly_price IS NULL OR monthly_price = 0);
UPDATE public.subscription_plans SET monthly_price = 1999, yearly_price = 19990
 WHERE plan_name = 'leader'  AND (monthly_price IS NULL OR monthly_price = 0);

-- 4) Make sure they are purchasable (some rows may still have this false).
UPDATE public.subscription_plans
   SET is_purchasable = true,
       is_visible = true,
       is_enabled = true
 WHERE plan_name IN ('starter','growth','leader');

-- 5) Sanity check
SELECT sp.plan_name, sp.monthly_price, sp.yearly_price,
       pt.id AS base_tier_id, pt.monthly_price AS tier_monthly, pt.daily_views
  FROM public.subscription_plans sp
  LEFT JOIN public.plan_tiers pt
    ON pt.plan_name = sp.plan_name AND pt.is_base = true AND pt.is_active = true
 WHERE sp.plan_name IN ('starter','growth','leader')
 ORDER BY sp.display_order;

COMMIT;
