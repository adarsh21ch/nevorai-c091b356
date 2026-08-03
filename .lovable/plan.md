
# Nevorai Subscription System Rebuild

## Goal

Replace the current confusing free/basic/pro + view-limits system with a clean 3-plan structure where **every price, name, limit, and copy string is admin-editable from the DB** — zero hardcoding.

---

## Final Plan Structure (initial seed values — all editable)

| | **Trial** | **Starter** | **Growth** ⭐ | **Team** |
|---|---|---|---|---|
| Price | ₹0 for 7 days | ₹199/mo · ₹1,990/yr | ₹699/mo · ₹6,990/yr | ₹1,499/mo · ₹14,990/yr |
| Funnels | Unlimited | 5 | Unlimited | Unlimited |
| Landing pages | Unlimited | 1 | Unlimited | Unlimited |
| Live sessions | ✅ | ❌ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ✅ | ✅ |
| Hide Nevorai badge | ❌ | ❌ | ✅ | ✅ |
| WhatsApp manual send | ✅ | ✅ | ✅ | ✅ |
| WhatsApp automation | ✅ | ❌ | ✅ (500 msg/mo) | ✅ (unlimited) |
| WhatsApp templates | Full | — | Basic | Full |
| Team members | — | — | — | Up to 5 |
| Team dashboard/leaderboard/shared leads | — | — | — | ✅ |
| Storage | **1 GB** | **2 GB** | **10 GB** | **25 GB shared** |
| View limits | **None (removed everywhere)** | | | |

---

## The Only 3 User States

1. **Trial** — 7 days, Growth features, 1GB storage
2. **Paid** — Starter / Growth / Team
3. **Blocked** — trial expired OR paid plan lapsed → red gate + prospect sees "creator's plan ended, contact them to upgrade"

No "free tier". The word "free" only appears as marketing copy ("7-day free trial").

---

## Lifecycle

```text
Signup → 7-day Trial (Growth features, 1GB)
   │
   ├─ Pays before day 8 → Active (Starter/Growth/Team)
   │      ├─ Renews → Active (loop)
   │      └─ Fails/skips → 3-day grace (amber banner) → Blocked
   │
   └─ Day 8, no payment → Blocked (red gate on dashboard,
                          prospect sees "plan ended" gate)
```

Team members' access resolves through the leader's subscription — if leader lapses, all members go to grace → blocked in the same cycle.

---

## Migration for Existing Users (ship-day)

- All current `free` users → fresh 7-day trial starting today (not backdated)
- In-app banner: *"You're on a 7-day free trial with full access."*
- Emails: day 1 welcome, day 5 reminder, day 7 final notice
- Day 8 → blocked (standard flow)

---

## Zero-Hardcoding Rule

**Source of truth = DB.** All prices, names, limits, feature bullets, copy — editable from Admin Plans page. Code reads stable slugs (`starter`/`growth`/`team`) only as internal keys; display names and everything else come from DB.

---

## Technical Section

### 1. Database schema

**Extend `subscription_plans`** (source of truth for plan config):
```sql
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS
  display_name text,
  description text,
  badge_text text,               -- "Most Popular", "Best Value"
  accent_color text,
  sort_order int DEFAULT 0,
  price_monthly numeric,
  price_yearly numeric,
  currency text DEFAULT 'INR',
  yearly_discount_label text,    -- "Save 17%"

  max_funnels int,               -- -1 = unlimited
  max_landing_pages int,
  max_team_members int DEFAULT 0,
  max_storage_gb numeric,

  live_enabled boolean DEFAULT false,
  custom_domain_enabled boolean DEFAULT false,
  hide_branding boolean DEFAULT false,

  whatsapp_automation_enabled boolean DEFAULT false,
  whatsapp_monthly_cap int DEFAULT 0,   -- -1 = unlimited, 0 = disabled
  whatsapp_templates_level text DEFAULT 'none', -- none|basic|full

  nev_ai_monthly_quota int DEFAULT 0,

  features_jsonb jsonb DEFAULT '[]',    -- ordered bullets for pricing card
  is_visible boolean DEFAULT true,      -- hide from public pricing page
  is_purchasable boolean DEFAULT true;
```

**Extend `app_settings`** (global toggles):
- `trial_enabled`, `trial_days` (default 7), `trial_plan_slug` (which plan's features apply during trial)
- `access_grace_days` (default 3, for paid-plan lapse)
- `prospect_gate_title`, `prospect_gate_message` (creator-plan-ended copy)
- `upgrade_banner_title`, `upgrade_banner_body`

**New `team_members` table:**
```sql
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  status text DEFAULT 'pending', -- pending|active|removed
  UNIQUE(owner_id, member_id)
);
-- + grants, RLS: owner sees own team, member sees own row
```

**New RPC `get_effective_access(user_id)`** — SECURITY DEFINER, returns:
```json
{
  "state": "trial|active|grace|blocked",
  "source": "self|team",
  "leader_id": "uuid | null",
  "plan_slug": "trial|starter|growth|team",
  "expires_at": "...",
  "grace_ends_at": "..."
}
```
Called by all gating logic — one function, one source of truth.

### 2. Files to delete / gut

- `src/config/planFeatures.ts` — delete (was hardcoded features per tier)
- `src/config/planDisplay.ts` — delete (was hardcoded display metadata)
- `src/hooks/useMonthlyViews.tsx` — keep as analytics read-only, remove blocking behavior
- `src/hooks/useDailyViews.tsx` — same
- `src/components/MonthlyViewsBanner.tsx` — delete
- `src/components/admin/FreeAccessSettingsStrip.tsx` — delete (obsolete)
- `src/hooks/useAccessState.ts` — rewrite to call `get_effective_access` RPC
- `src/hooks/useOwnerActive.ts` — rewrite to call `get_effective_access` for the owner
- `supabase/functions/check-funnel-view-limit/` — delete
- `owner_plan_active_migration.sql` — supersede with new RPC

### 3. Files to refactor

- `src/hooks/usePlan.tsx`, `usePlanLimits.tsx` — read from `subscription_plans` join, no hardcoded limits
- `src/pages/PricingFullPage.tsx` — render entirely from `subscription_plans` rows (visible, purchasable, sort_order)
- `src/pages/BillingPage.tsx` — same
- `src/pages/FunnelsPage.tsx` — enforce `max_funnels` from DB at create
- `src/pages/LandingPagesPage.tsx` — enforce `max_landing_pages`
- `src/pages/LivePage.tsx` + `LiveDetailPage.tsx` — gate on `live_enabled`
- All WhatsApp send paths (`whatsapp-send`, `whatsapp-sequence-runner`, etc.) — check `whatsapp_automation_enabled` + increment monthly counter, block at `whatsapp_monthly_cap`
- `src/lib/r2VideoUpload.ts` + `get-r2-upload-url` edge fn — check `max_storage_gb` before signing upload URL
- `supabase/functions/get-funnel-data/index.ts` — replace ad-hoc gating with `get_effective_access` RPC
- All prospect-facing gates — read title/message from `app_settings`

### 4. New files

- `src/hooks/useEffectiveAccess.ts` — client mirror of the RPC
- `src/hooks/useSubscriptionPlans.ts` — cached DB fetch of all visible plans
- `src/lib/planGates.ts` — pure helper functions: `canCreateFunnel(plan, currentCount)`, `canGoLive(plan)`, `canSendWhatsappAutomation(plan, monthlyUsed)`, `canUpload(plan, currentBytes, incomingBytes)`
- `src/components/admin/PlanEditor.tsx` — full CRUD editor for a plan row with live pricing-card preview
- `src/components/admin/GlobalSettingsPanel.tsx` — trial days, grace days, prospect copy, banner copy
- `src/components/admin/TeamMembersView.tsx` — admin view of teams
- `src/pages/TeamMembersPage.tsx` — Team owner UI: invite / remove / see member activity
- `src/components/team/TeamInviteAcceptGate.tsx` — invited-member onboarding
- `whatsapp_monthly_usage` table + tracking

### 5. Admin panel (AdminPlansPage rebuild)

**Tab 1 — Plans**: list of `subscription_plans` rows, click to edit any field, live preview of pricing card, "Show on pricing page" toggle, drag-to-reorder.

**Tab 2 — Global Settings**: trial days, grace days, prospect gate copy, upgrade banner copy, master toggles.

**Tab 3 — Teams**: overview of all Team owners, member counts, activity.

**Tab 4 — Audit log** (recommended): who changed what/when.

### 6. Team access resolution (the tricky part)

Every gate check goes through `get_effective_access(auth.uid())`:
1. Does user have own active paid sub? → return that plan
2. Is user a `team_members.member_id` with status='active'? → resolve leader's access, but cap feature level at **Starter** (never leader's level)
3. Else → check trial → check blocked

Members see a badge: *"Team access via [Leader Name] — expires with their subscription."*

### 7. Ship-day migration script

```sql
-- Migrate all current free-tier users to fresh 7-day trial
UPDATE profiles
SET subscription_status = 'trial',
    trial_start_date = now()
WHERE subscription_status IN ('free', null)
  AND NOT EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = profiles.id
      AND us.status = 'active'
      AND us.tier IN ('basic', 'pro', 'starter', 'growth', 'team')
  );

-- Hide free plan from public pricing
UPDATE subscription_plans SET is_visible = false, is_purchasable = false WHERE plan_name = 'free';

-- Rename basic→starter, pro→growth in display_name only (keep DB slug for FK integrity)
UPDATE subscription_plans SET display_name = 'Starter' WHERE plan_name = 'basic';
UPDATE subscription_plans SET display_name = 'Growth', badge_text = 'Most Popular' WHERE plan_name = 'pro';

-- Insert Team plan
INSERT INTO subscription_plans (plan_name, display_name, price_monthly, ...) VALUES ('team', 'Team', 1499, ...);
```

### 8. Razorpay webhook audit

Verify `razorpay-webhook` correctly flips `user_subscriptions.status = 'expired'` on:
- `subscription.halted`
- `subscription.cancelled`
- `payment.failed` (after retry window)

Add integration test or manual test script.

### 9. Trial-expired = blocked bug fix

Ensure `get_effective_access` returns `blocked` when `status='trial'` AND `(now - trial_start_date) >= trial_days` AND no paid sub — regardless of any legacy free-access toggle.

---

## Build Order (proposed)

1. Schema migration + seed (3 plans + Team plan row)
2. `get_effective_access` RPC + `useEffectiveAccess` hook
3. Refactor `usePlan` / `usePlanLimits` to read from DB
4. Delete `planFeatures.ts` / `planDisplay.ts`, fix all imports
5. Refactor all creation flows to use `planGates.ts` helpers
6. Remove view-limit enforcement everywhere (keep analytics reads)
7. Storage cap enforcement in R2 upload path
8. WhatsApp monthly cap tracking + enforcement
9. Team members table + Team owner UI + access resolution
10. Rebuild AdminPlansPage (4 tabs)
11. Rebuild PricingFullPage (100% DB-driven)
12. Prospect gate copy from `app_settings`
13. Ship-day migration script + email sequence
14. Razorpay webhook audit
15. QA all lifecycle transitions (trial → paid → renew → lapse → grace → blocked; team leader lapse cascade)

---

## Non-goals (explicit)

- Not adding view limits (removed everywhere)
- Not building add-ons/one-off purchases yet
- Not building per-seat Growth upgrades in Team (Option C rejected)
- Not touching profile page (already redesigned)
- Not touching landing page monochrome rebrand
