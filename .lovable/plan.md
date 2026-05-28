# Rename `plan_config` → `subscription_plans`, `plan_view_tiers` → `plan_tiers`

Two-phase rename: Supabase SQL first, then a global code sweep. Migration files are left untouched per request.

## Step 1 — SQL to run on Supabase

```sql
-- Rename tables
ALTER TABLE public.plan_config     RENAME TO subscription_plans;
ALTER TABLE public.plan_view_tiers RENAME TO plan_tiers;

-- Compatibility views (kept until code sweep is verified)
CREATE OR REPLACE VIEW public.plan_config     AS SELECT * FROM public.subscription_plans;
CREATE OR REPLACE VIEW public.plan_view_tiers AS SELECT * FROM public.plan_tiers;

-- Grants
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT SELECT ON public.plan_tiers         TO anon, authenticated;
GRANT SELECT ON public.plan_config        TO anon, authenticated;
GRANT SELECT ON public.plan_view_tiers    TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

After Step 2 lands and the three pages (Admin Plans, Pricing, Billing) verify clean, run:

```sql
DROP VIEW IF EXISTS public.plan_config;
DROP VIEW IF EXISTS public.plan_view_tiers;
```

## Step 2 — Code sweep

For each file below, replace:
- `.from('plan_config')` / `.from("plan_config")` → `.from('subscription_plans')`
- `.from('plan_view_tiers')` / `.from("plan_view_tiers")` → `.from('plan_tiers')`
- Any `(supabase.from("plan_view_tiers" as any) as any)` patterns → drop the `as any` cast once types are regenerated; until then keep cast and just rename the string.
- Query keys that mention old table names (`'plan-view-tiers'`, `'plan-configs'`) stay as cache keys — they're just strings — but I'll leave them alone to avoid churn (they don't affect behavior).

Files:
- `src/components/FeatureGate.tsx`
- `src/components/admin/EnterpriseCardSettings.tsx`
- `src/components/admin/PlanEditorTable.tsx`
- `src/components/admin/ViewTiersManager.tsx`
- `src/components/admin/ViewsAnalyticsCard.tsx`
- `src/components/admin/CreatePlanDialog.tsx` *(also references these tables — included for completeness)*
- `src/components/billing/ViewCapacityCard.tsx`
- `src/components/landing/PricingSection.tsx`
- `src/config/planFeatures.ts`
- `src/hooks/useOwnerBranding.tsx`
- `src/hooks/usePlan.tsx`
- `src/hooks/usePlanLimits.tsx`
- `src/hooks/usePlans.ts` *(reads `plan_config` — also needs rename)*
- `src/hooks/useStorageUsage.ts`
- `src/pages/AdminPlansPage.tsx`
- `src/pages/AdminSubscriptionsPage.tsx`
- `src/pages/AdminUsersPage.tsx`
- `src/pages/BillingPage.tsx`
- `src/pages/PricingFullPage.tsx`

### `src/integrations/supabase/types.ts`

Rename the generated table type aliases:
- `PlanConfig` → `SubscriptionPlan`
- `PlanViewTiers` → `PlanTier`

And the table keys under `Database['public']['Tables']`:
- `plan_config` → `subscription_plans`
- `plan_view_tiers` → `plan_tiers`

Update all consumers in the same edit batch (anything importing `PlanConfig` / `PlanViewTiers` from this module).

> Note: this file is normally regenerated. After the rename runs in Supabase and Lovable types refresh, the regenerated file will produce the new names automatically — this manual edit keeps types compiling in the meantime.

### Edge functions (Deno SQL strings only)

- `supabase/functions/get-r2-upload-url/index.ts`
- `supabase/functions/razorpay-portal/index.ts`
- `supabase/functions/razorpay-webhook/index.ts`
- `supabase/functions/send-landing-page-confirmation/index.ts`

Same replacement: any `.from('plan_config')` / `.from('plan_view_tiers')` strings → new names. **Do not** touch references to the unrelated `admin_subscription_plans` table.

## Out of scope

- Migration files under `supabase/migrations/` (historical).
- `admin_subscription_plans` (different table, unaffected by this rename).
- Renaming React Query cache keys.

## Verification

1. Admin → Plans loads, lists existing plans, create/delete still work.
2. `/pricing` shows enabled plans from the renamed table.
3. `/billing` view capacity card + plan badge render with correct limits.
4. Razorpay checkout returns a valid order (edge function still resolves prices).
5. Then run the `DROP VIEW` cleanup.
