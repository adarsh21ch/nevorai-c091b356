# Nevorai – Claude Code Context

## What is this app?

**Nevorai** is a video funnel SaaS platform for Indian network marketers and sales people. Creators share videos, track every view, capture leads, and run multi-step funnels. Target market: Indian network marketing distributors who use WhatsApp to sell. Hosted at `nevorai.com`. Made in India.

**Positioning**: "Unskippable video for network marketers" — category-of-one vs. B2B MLM software. Cheap enough for individual distributors to self-purchase.

## The Nevorai Product Family

- **Nevorai** (formerly nFlow) — Video funnel SaaS ← THIS PROJECT
- **nCall** — Calling/communication app (separate Lovable project)
- **Backupshala** — Course builder / LMS (separate Lovable project)
- **Launchpad** — Landing page builder with space theme (separate Lovable project)
- **nevorai-sales-compass** (`/Users/apple/Projects/nevorai-sales-compass`) — Archive of all historical Lovable prompts. Read this if you need full context on past decisions.

## Tech Stack

- **Framework**: TanStack Start (React, file-based routing via `src/routes/`)
- **Styling**: Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Backend/DB**: Supabase (Postgres + auth + storage)
- **Payments**: Razorpay (Indian payment gateway)
- **Deployment**: Cloudflare (via `wrangler.jsonc` + `@cloudflare/vite-plugin`)
- **Build tool**: Vite + Bun
- **Forms**: react-hook-form + zod
- **State/data**: TanStack Query
- **Animations**: Framer Motion

## Project Structure

```
src/
  routes/          # File-based pages (TanStack Router)
  components/
    funnel/        # Funnel builder & viewer components
    admin/         # Admin panel components
    dashboard/     # Dashboard KPIs, content rows
    landing/       # Public landing page sections
    billing/       # Billing & plan capacity UI
    auth/          # Auth pages & route guards
    layout/        # Dashboard & admin layouts
  config/
    brand.ts       # Brand name, domain, social links
    planFeatures.ts # Single source of truth for plan features/limits
    planDisplay.ts  # Display helpers for plans
  hooks/           # Custom React hooks
  utils/           # Pure utility functions (prorateUpgrade.ts etc.)
supabase/          # Supabase migrations & config
```

## Plans System

**Three plans**: `free`, `basic`, `pro`

- Features/limits: `src/config/planFeatures.ts` — single source of truth. Adding a feature here auto-adds it to admin editor and maps to `plan_config` DB column.
- **Prices**: `plan_view_tiers` DB table — the ONLY source of truth for prices. Never hardcode prices anywhere. Admin writes here → pricing page, checkout, upgrade all read from here.
- `plan_config` stores ONLY limits (not prices).
- View tiers: each plan has multiple tiers (different daily view counts at different prices).
- **Base tier** is the lowest tier per plan (marked `is_base=true`).

### Pricing (from plan_view_tiers — verify in DB for current values):
- **Basic**: from ₹149/month (base: 20 views/day)
- **Pro**: from ₹599/month (base: 200 views/day)
- Yearly = monthly × 12 × 0.83 (17% discount)
- Free plan: exists in DB but NOT shown on public pricing page

## Subscriptions & Trial

- **Trial**: 7-day trial with full Pro-level access on signup
- `trial_start_date` set on first login
- `subscription_status = 'trial'` → after expiry → upgrade gate shown (cannot dismiss)
- **Tier upgrades**: prorated — user pays only price difference × remaining days
- Proration logic: `src/utils/prorateUpgrade.ts`

## View Limit System

- Modes: `daily`, `monthly`, or `both` — set per plan in `plan_config.view_limit_mode`
- DB: `user_daily_views` table (one row per user per day, UPSERT on increment)
- View counting: guarded by `sessionStorage` key to count once per page session only
- Extra views: users can top-up (buy extra views) from billing page
- At ~80% of limit: upgrade prompt shown in-app

## Key Features

- **Funnel**: Multi-step journey — video → lead form → testimonials → WhatsApp → code gate → landing page
- **Funnels are "flows"** (renamed internally)
- **Views**: tracked per funnel, limits enforced at public viewer level
- **Member**: Prospect/lead going through a funnel (`f.$slug.member` routes)
- **Live sessions**: Creator can go live inside a funnel
- **Landing pages**: Separate public pages linked to funnels
- **Branding watermark**: "Made with Nevorai" badge on public pages (plan feature toggle)
- **Admin panel**: Full override of user plans, subscriptions, trial settings, view tiers

## Development Workflow

- **This is the ACTIVE production folder** (`~/nevorai`) — connected to `adarsh21ch/nevorai.git`
- Old folder `~/nflow-sparkle-joy (legacy path)` is abandoned (last commit May 11, 2026 — repo was renamed to "Nevorai" and dev continued here)
- Historical Lovable prompts for all Nevorai products are in `/Users/apple/Projects/nevorai-sales-compass/`
- When asked about past decisions or architecture, check that directory for context

## Ongoing / Important Notes

<!-- Update this section as work progresses -->
- Latest work: Added WhatsApp test page (commit 9eeebcc), fixed video upload retry bug
- User reinstalled Claude Code in May 2026 — prior session context recovered from nevorai-sales-compass archive
- Target market: Indian network marketers running WhatsApp-based sales
- Meta Ads running at ₹100-200/day budget targeting this niche

## Rules
- Every new PUBLIC route (anything served without auth) MUST set head() via `buildOgMeta` from `src/lib/ogMeta.ts`, fetching title/description/image in the route loader so crawlers see OG tags without JS.
