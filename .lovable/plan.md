## Coupon Codes for Subscription Plans

Add admin-managed coupon codes that users can apply at checkout to get a discount on a Basic/Pro tier. Server is the source of truth — coupons are validated and the final price is recomputed in the edge function, so codes cannot be forged from the browser.

### What you'll see as a user

- **Admin → Plans** gets a new **Coupons** tab.
  - Create coupon: code (e.g. `LAUNCH50`), plan (Basic / Pro / Any), tier (specific tier or any tier on that plan), billing cycle (Monthly / Yearly / Both), discount type (Percent off / Fixed final price), discount value, expiry date (optional), active toggle.
  - Table of existing coupons with active/expired/exhausted state, redemptions count, and edit/delete.
- **Checkout** (Pricing page + Upgrade flow + Billing tier picker) gets an **"Have a coupon code?"** input.
  - User types code → "Apply" → shows `₹2,499` struck through and `₹1,250` as the new price + green "Coupon LAUNCH50 applied — 50% off".
  - Invalid/expired/wrong-plan code → inline red message ("Coupon expired", "Not valid for this plan", "Already redeemed", etc.).
  - Pay button charges the discounted amount via Razorpay.

### Rules enforced server-side

1. Coupon must be `is_active = true`, not past `expires_at`, and applicable to the chosen plan+tier+billing cycle.
2. **One use per user** — a row in `coupon_redemptions` blocks a second use of the same coupon by the same user.
3. Final price = `percent` → `tier_price × (1 - discount_value/100)`, or `fixed_price` → `discount_value` (must be ≤ tier price, else rejected).
4. Minimum charge is ₹1 (Razorpay constraint).
5. Coupons do **not** stack with proration; if a user is doing a prorated plan upgrade, the coupon applies to the target-plan price *before* proration so the discount carries through cleanly.
6. Redemption row is written only after Razorpay payment is verified (no leak on abandoned checkouts).

### Technical details

**New tables (SQL — you run manually, same as previous):**

```sql
create table public.plan_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan_name text,                       -- 'basic' | 'pro' | null = any plan
  tier_id uuid references public.plan_tiers(id) on delete cascade,  -- null = any tier on plan
  billing_cycle text not null default 'both' check (billing_cycle in ('monthly','yearly','both')),
  discount_type text not null check (discount_type in ('percent','fixed_price')),
  discount_value numeric not null check (discount_value > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select on public.plan_coupons to authenticated;
grant all on public.plan_coupons to service_role;
alter table public.plan_coupons enable row level security;
create policy "admins manage coupons" on public.plan_coupons
  for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create policy "authenticated can read active coupons" on public.plan_coupons
  for select to authenticated using (is_active = true);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.plan_coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  razorpay_payment_id text,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;
alter table public.coupon_redemptions enable row level security;
create policy "user reads own redemptions" on public.coupon_redemptions
  for select to authenticated using (user_id = auth.uid());
create policy "admins read all redemptions" on public.coupon_redemptions
  for select to authenticated using (public.has_role(auth.uid(),'admin'));
```

**Edge function `razorpay-portal` — additions:**
- New action `validate_coupon` → `{ code, plan_key, tier_id, billing_cycle }` returns `{ valid, original_price, discounted_price, discount_label }` or `{ valid:false, error }`. Used by the checkout UI to preview the discount without creating an order.
- `create_order` accepts optional `coupon_code`. When present: re-validate it, recompute `authoritativeAmount`, attach `coupon_id` + `coupon_code` to `order.notes`. Price-parity guard compares against the discounted price.
- `verify_payment` (and `verify_tier_upgrade`): if `order.notes.coupon_id` is set, insert into `coupon_redemptions` (unique constraint enforces one-per-user atomically) after the subscription row is written.

**Frontend additions:**
- `src/components/admin/CouponsTab.tsx` — table + create/edit dialog. Mounted in `AdminPlansPage` as a new tab next to Plans / View Tiers.
- `src/components/checkout/CouponInput.tsx` — reusable input that calls `validate_coupon`, displays state, and emits `{ code, discounted_price }` upward.
- Wire `CouponInput` into the three checkout entry points: `PricingFullPage`, `BillingPage` (plan upgrade), and the tier upgrade dialog in `ViewCapacityCard`. Pass `coupon_code` and the displayed discounted price into the `create_order` payload.
- No changes to non-checkout pages.

### Out of scope (call out so we're aligned)

- Max-total-uses cap, per-funnel coupons, stacking with view top-ups, and "first payment only" subscription-renewal behaviour — not in this round per your answers.
- Razorpay's own coupon/offer feature (we keep it fully in our DB so admin has one place to manage).

### What you'll need to run

After I ship the code, you'll need to run the SQL block above in Supabase (one block — both tables + grants + policies). I'll print it again in the final message with a checklist.
