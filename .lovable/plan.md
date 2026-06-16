# Unified Tracking Engine — Audit + Plan

## STEP 0 — Audit (confirmed from live code)

1. **Video→surface links exist** — `funnels.video_asset_id`, `funnel_steps.video_id`, `landing_pages.video_asset_id` (+ `post_submit_video_asset_id`), `live_sessions.video_asset_id`. ✅
2. **Event tables in code**: `video_view_events`, `funnel_view_events`, `landing_page_view_events`, `live_session_view_events` (all written via `supabaseAdmin` in `entityTracking.functions.ts`, except video which has no event writer today). `link_events` (team) already has `visitor_fingerprint` + `ip_ua_hash`. The 4 entity event tables currently only have `session_id` + `device_type` + `referrer_source` + `last_heartbeat_at` — **no `visitor_fingerprint`, no `ip_ua_hash`**. ❌
3. **`PublicVideoPage.tsx` 178–192** does naive `view_count++` read-then-write, no event row. ✅ broken as described.
4. **`InsightsPage.tsx` line 398**: `totalEventViews = videoViews + funnelViews + lpViews` — **live missing**, and direct video events not produced. ✅ broken.
5. **Anon RLS / writes** — entity events are written from server functions via service role, so anon RLS isn't the blocker; but there's no client-side insert path and no anon insert policy on `video_view_events`. We'll route everything through a single RPC instead of opening anon inserts.

Conclusion: the prompt's diagnosis matches the live code. Safe to proceed.

## Architecture

ONE engine, ONE definition everywhere:
- **Views** = `count(*)`
- **People** (UI label) / `unique_views` (DB) = `count(distinct coalesce(visitor_fingerprint, ip_ua_hash))`
- Same `visitor_fingerprint` = the existing `nv_session_id` localStorage key already used by `trackEntityView`. Promote it from "session id" to "stable visitor fingerprint" (it already persists in localStorage).

Counters become **derived** from events via AFTER INSERT triggers. No app-code increments.

```text
       ┌─────────────────────── shared client helper ──────────────────────┐
       │  trackView(surface, id) → record_view RPC (security definer)      │
       └──┬──────────────┬───────────────┬───────────────┬─────────────────┘
          ▼              ▼               ▼               ▼
   video_view_events  funnel_…    landing_page_…   live_session_…
          │              │               │               │
          └──► AFTER INSERT triggers update counter columns (video_assets.view_count, funnels.total_views, …)
                          │
                          ▼
                get_video_rollup()  — blended per-video (direct + funnel + steps + landing + live)
                get_creator_insights_summary()  — JSON the AI reads
                get_admin_video_stats() / get_admin_video_daily()  — admin platform-wide
```

## Files

### New SQL migration `unified_tracking_engine_migration.sql`
- Add `visitor_fingerprint text`, `ip_ua_hash text`, `user_agent text` to `video_view_events`, `funnel_view_events`, `landing_page_view_events`, `live_session_view_events` (idempotent `add column if not exists`).
- Indexes: `(entity_id, coalesce(visitor_fingerprint, ip_ua_hash))` per table.
- `record_view(p_surface text, p_entity_id uuid, p_fingerprint text, p_session_id text, p_user_agent text, p_referrer text, p_device text)` — security definer, granted to `anon, authenticated`. Routes into the correct event table; computes `ip_ua_hash` from `request.headers` IP + UA inside the function.
- AFTER INSERT triggers:
  - `video_view_events` → `update video_assets set view_count = view_count + 1` (raw counter; unique is derived on demand).
  - `funnel_view_events` → `update funnels set total_views = total_views + 1` (we already added similar via `unify_view_tracking_migration` for `link_events`; keep both paths idempotent — funnel views currently flow through `link_events`, this trigger only fires if a future direct insert happens).
- `get_video_rollup(p_from, p_to)` — owner-scoped, returns per-video `direct_*`, `funnel_*`, `landing_*`, `live_*`, `total_*` (blended distinct fingerprint).
- `get_creator_insights_summary(p_owner uuid default auth.uid())` — single JSON with `period_totals`, `by_surface`, `top_videos`, `top_funnels`, `team_tracking`, `generated_at`.
- `get_admin_video_stats(p_from, p_to)` and `get_admin_video_daily(p_video_id, p_days)` — `security definer`, role-checked via existing `has_role(auth.uid(), 'admin')`.
- Optional one-time backfill of `ip_ua_hash` for existing rows (NULL-safe).

### Frontend
- **`src/lib/tracking.ts`**: rename `getOrCreateSessionId` → `getOrCreateVisitorFingerprint` (keep export alias), add `trackView(surface, entityId)` that calls `record_view` RPC. Keep existing `trackEntityView` (back-compat) but route it through `trackView`.
- **`src/pages/PublicVideoPage.tsx`**: remove the manual `view_count++` block (lines 172–193) and replace with a one-time `trackView('video', id)` call (same session-flag guard).
- **`src/components/funnel/MultiStepViewer.tsx`** + **`src/pages/PublicFunnel.tsx`**: keep `trackFunnelEvent` (already unified) — no change here.
- **`src/pages/PublicLandingPage.tsx`** + **`src/pages/PublicLivePage.tsx`**: ensure they call `trackView('landing'|'live', id)` (currently call `trackEntityView` which now goes through the same path — no UI change).
- **`src/pages/InsightsPage.tsx`**:
  - Add `live_session_view_events` to the period query; recompute `totalEventViews` to include it.
  - Recompute `uniqueViewerEstimate` using `visitor_fingerprint` (fall back to `session_id`, then `ip_ua_hash`).
  - Relabel UI: "Unique Viewers" → **"People"** in all hero/sub copy.
  - Per-funnel cards: date-filter already applied via the period query; ensure cards read `funnelViewCount[id]` not lifetime counter when period ≠ All. (Already partly handled at line 444 for videos; mirror for funnels.)
  - Add **"Open Team Tracking"** Button below the KPI hero, visible to all (renders the existing `TeamTrackingDashboard` sheet — already supports solo-owner "You" row).
- **`src/pages/VideosPage.tsx`** (or the video card list inside InsightsPage Videos tab): show blended total via `get_video_rollup` — one extra query, mapped to each card.
- **`src/pages/AdminVideosPage.tsx`**: replace the 0/0 columns with data from `get_admin_video_stats`; relabel "Unique" → **"People"**. Row click → modal/drawer with a daily line chart (recharts is already in deps) fed by `get_admin_video_daily`.

### Edge function
- **`supabase/functions/nev-ai-query/index.ts`**: replace its denormalised reads with a single `supabase.rpc('get_creator_insights_summary')` call; inject the JSON into the model prompt; update the system prompt to define "Views vs People vs Leads" and instruct the AI to SAY "people" (never "unique views"). Redeploy required.

## Out of scope this round (acknowledged, not built)
- Course surface (designed for it — `record_view` takes a surface string, `get_video_rollup` adds a course branch in one place).

## Acceptance — how each item gets verified
After deploy: a fresh incognito visit to `/v/<id>` writes one `video_view_events` row with a fingerprint and bumps `video_assets.view_count` via trigger; refresh increments views, fingerprint stays so People = 1. Overview KPIs match the sum across `videos + funnels + landing + live` for the period. `get_video_rollup` returns non-zero for any video referenced by an active funnel/landing/live. Nev AI's "how many views this week" answer equals the dashboard's 7d Total Views.

## Why this is one migration + ~8 edits
Reusing the existing fingerprint key (`nv_session_id`) and routing everything through one `record_view` RPC means each surface gets uniqueness and blended rollup "for free" — no per-surface client rewrites.
