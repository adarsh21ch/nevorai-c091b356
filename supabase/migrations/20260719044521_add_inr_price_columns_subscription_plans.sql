-- ============================================================================
-- Add INR pricing columns to subscription_plans
-- Run in Supabase SQL editor. Idempotent.
--
-- Fixes: "Could not find the 'monthly_price' column of 'subscription_plans'
-- in the schema cache" when saving a plan price in Admin → Plans.
-- ============================================================================

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yearly_price  numeric(10,2) NOT NULL DEFAULT 0;

-- Backfill from the legacy plan_tiers base row so current prices carry over.
UPDATE public.subscription_plans sp
   SET monthly_price = t.monthly_price,
       yearly_price  = t.yearly_price
  FROM (
    SELECT DISTINCT ON (plan_name)
           plan_name, monthly_price, yearly_price
      FROM public.plan_tiers
     WHERE is_active = true
     ORDER BY plan_name, is_base DESC, display_order ASC
  ) t
 WHERE sp.plan_name = t.plan_name
   AND (sp.monthly_price IS NULL OR sp.monthly_price = 0);

-- Seed defaults for the three canonical tiers if still zero.
UPDATE public.subscription_plans SET monthly_price = 249,  yearly_price = 2490  WHERE plan_name = 'starter' AND COALESCE(monthly_price,0) = 0;
UPDATE public.subscription_plans SET monthly_price = 699,  yearly_price = 6970  WHERE plan_name = 'growth'  AND COALESCE(monthly_price,0) = 0;
UPDATE public.subscription_plans SET monthly_price = 1499, yearly_price = 14930 WHERE plan_name = 'leader'  AND COALESCE(monthly_price,0) = 0;

-- Reload PostgREST schema cache so the columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
