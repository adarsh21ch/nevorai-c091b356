# Audit (STEP 0 — confirmed against the live repo)

1. **No anon INSERT policy on `*_view_events`.** `funnel_view_events` etc. are written by the server fn `startEntityView` via `supabaseAdmin` (service role), so RLS doesn't block them — but the call is silently swallowed in `tracking.ts` (`console.debug` only). That's why Insights can show **0 views** even when a lead saves. **Yes, this is a real silent-failure path.**
2. **`funnels.total_views`** is a legacy counter column. Nothing in the current codebase increments it — the 2129 / 743 numbers are pre-existing data from an older code path. There's no active trigger or RPC writing it today.
3. **`PublicFunnel.tsx` line 882** *does* call `trackLinkEvent(funnel.id, null, "view")` — but `trackLinkEvent` returns early if there is **no `?t=` / `?ref=` token in the URL**. So direct/owner/WhatsApp-forwarded opens never reach `link_events`. **Confirmed: owner views are invisible to Team Tracking.**
4. There is **no owner-default `funnel_share_links` row** auto-created per funnel. Only links explicitly created by the user exist.
5. `get_team_tracking` + `track_link_event_v2` exist and match `team_tracking_dashboard_migration.sql`. **Will not be recreated.**

# The Fix

Make **`link_events`** the single source of truth for funnel views. Every funnel open writes exactly one view event, attributed to the right member (owner by default).

## Backend / SQL — new migration `unify_view_tracking_migration.sql`

1. **Owner-default share link per funnel.**
   - `ensure_owner_share_link(p_funnel_id uuid) returns text` — `security definer`, granted to `anon, authenticated`. Looks up the funnel, finds-or-creates a row in `funnel_share_links` where `is_universal = true`, `owner_id = funnels.owner_id`, `assigned_user_id = funnels.owner_id`, `label = 'Direct'`. Returns the token. Idempotent via the existing `uq_share_links_universal_per_funnel`.
   - Backfill: `insert ... select` one universal row for every existing funnel that lacks one.
2. **`track_funnel_view(p_funnel_id, p_token, p_fingerprint, p_user_agent)`** — wrapper RPC, security definer, granted to `anon, authenticated`. If `p_token` is null/empty, calls `ensure_owner_share_link` to get the default, then delegates to the same logic as `track_link_event_v2`. Single entry point for "record a funnel view."
3. **Optional one-time backfill** (commented "run once"): for every `funnel_leads` row whose `(share_link_id, visitor_fingerprint)` has no matching `link_events` view, insert a synthetic view. Also: for every `funnel_leads` row with NULL `share_link_id`, set it to the owner-default share link for that funnel. Guarantees the lead⇒view invariant for historical data.
4. **`funnels.total_views` trigger.** `after insert on link_events when (new.event_type = 'view')` → `update funnels set total_views = total_views + 1 where id = new.funnel_id`. Plus a one-shot recompute that resets `total_views` to `count(distinct coalesce(visitor_fingerprint, ip_ua_hash))` from `link_events` so the list and Insights reconcile from day one.
5. RLS: `link_events` insert path stays through the RPC (security definer); no new direct anon grants. Confirms anon EXECUTE on the new RPC.

## Frontend

### `src/pages/PublicFunnel.tsx`
- Replace the `trackLinkEvent(funnel.id, null, "view")` + `trackEntityView("funnel", funnel.id)` pair with a single call to a new helper `trackFunnelView(funnelId)` (added to `src/lib/teamTracking.ts`) that calls the new `track_funnel_view` RPC. Resolves owner-default token when no `?t=`/`?ref=` is present. Fires on funnel load, **before** any gate (private / lead / code) renders, so gated funnels still record views.
- On lead submit: keep existing `trackLinkEvent(..., "lead")` calls; additionally ensure a view event is recorded for the same visitor (the RPC handles dedup, safe to call view+lead).
- Stop calling `trackEntityView("funnel", …)` for funnels. Videos / landing pages / live keep their existing tracker untouched.

### `src/components/funnel/MultiStepViewer.tsx`
- Same swap: per-step view uses the new helper so even owner-direct multi-step funnels record per-step views into `link_events`.

### `src/pages/InsightsPage.tsx`
- The `funnel_view_events` query (~line 228) and the KPI math (`totalEventViews`, `uniqueViewerEstimate` ~561–562) read from `link_events` instead:
  - **Total Views** = `count(*) where event_type='view' and funnel_id in (...) and created_at between …`
  - **Unique Viewers** = `count(distinct coalesce(visitor_fingerprint, ip_ua_hash))`
- Live-viewer "active in last 5 min" funnel branch (~line 258) also moves to `link_events`.
- Video / landing / live KPI queries unchanged.
- KPI hero reorder: **Unique Viewers** and **Leads** become the two big cards. **Total Views** becomes a small muted sub-line under Unique Viewers. **Live Viewers** card removed from Overview (kept on Live tab only).
- Always render the `My Activity | Team Tracking` segment (drop the `hasTeam` gate on visibility — keep it only for the default selection).

### `src/pages/FunnelsPage.tsx`
- `f.total_views` keeps rendering; the new trigger keeps it accurate. No code change needed beyond confirming the column is selected (already is, line 130 of InsightsPage / FunnelsPage list).

### `src/components/insights/TeamTrackingDashboard.tsx`
- When `members` is just `[you]` and `grand_viewers > 0`, still render the sheet with the "You" row populated. When `grand_viewers === 0` AND no team, show the connect-link CTA **above** an empty-state sheet (not instead of). One sheet only; `MyTeamPage`'s deep-link is already `?tab=overview&view=team` — leave intact.

## Acceptance checks I'll run after the edits
- Open a funnel in a fresh incognito tab → one row appears in `link_events` with `event_type='view'`, attributed to owner-default share link.
- Refresh 50× → still 1 unique viewer (dedup via `uq_link_events_unique_view`).
- Submit lead with no view yet (private/code gate) → both view + lead rows exist; `leads ≤ unique viewers` holds.
- Insights Overview funnel KPIs match the My Funnels counters and Team Tracking grand_viewers.
- Owner with no team sees "You" row populated in Team Tracking with their own funnel opens.
- No console errors; video/landing/live KPIs unchanged.

## Files touched

- new: `unify_view_tracking_migration.sql`
- edit: `src/lib/teamTracking.ts` (add `trackFunnelView`)
- edit: `src/pages/PublicFunnel.tsx`
- edit: `src/components/funnel/MultiStepViewer.tsx`
- edit: `src/pages/InsightsPage.tsx`
- edit: `src/components/insights/TeamTrackingDashboard.tsx`

No edge functions need redeploy. Run the new SQL migration in Supabase, then the frontend changes ship as a normal deploy.
