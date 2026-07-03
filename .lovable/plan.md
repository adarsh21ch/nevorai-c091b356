
# Dashboard + Tracking Redesign

The dashboard becomes a follow-up workspace, not an analytics report. Every section answers one question: *who watched my video, how far, and how do I contact them right now?* Mobile-first, one column on phones.

## New page structure (`/dashboard`)

Top-to-bottom, replacing the current KPI strip + content rows overview:

```text
┌──────────────────────────────────────────┐
│ ● 5 watching now — tap to see who       │   LiveViewersBar
├──────────────────────────────────────────┤
│ Follow up today                          │   FollowUpToday
│  Ravi   Product demo  82% 🔥  [WA][Call] │
│  Anon   Offer video   41% ⚡  —          │
├──────────────────────────────────────────┤
│ Today  Yesterday  Week  Month            │   TodaysNumbers
│  12/3    18/2      74/9   210/34         │   (unique viewers / leads)
├──────────────────────────────────────────┤
│ Videos × Days matrix (scroll →)          │   TrackingMatrix
│  ▢ Demo    | 3 | 5 | 2 | 8 | …           │
│  ▢ Offer   | 0 | 1 | 4 | 2 | …           │
├──────────────────────────────────────────┤
│ Quick actions · Recent funnels           │   (kept from today)
├──────────────────────────────────────────┤
│ ▸ Advanced (traffic, attribution, team)  │   AdvancedSection
└──────────────────────────────────────────┘
```

Clicking any name anywhere opens the **Person Profile** drawer (mini-CRM for one prospect).

## Sections in detail

**1. LiveViewersBar** — replaces `WatchingNowStrip`. Slim bar always visible. Polls every 15s using existing `funnel_video_analytics` recent-events query. Click expands inline list of active viewers with name, video title, live % bar, and WA/Call buttons when a lead is attached. Empty state = one-line quiet strip.

**2. FollowUpToday** — new. Last 24h of engagement across owner's videos, ranked by score (watched % + CTA click). Row shows name/Anonymous, video, % watched, drop-off timestamp, relative time, HOT/WARM badge. WA button uses `wa.me/<phone>?text=…` with a short pre-filled Hinglish message; Call uses `tel:`. Empty state copy: "Share a video link — jisne dekha, wo yahan dikhega."

**3. TodaysNumbers** — four compact tiles (Today / Yesterday / Week / Month), each `unique viewers · leads`. No comparison chips. Reuses `useOwnerUniquePeople` and `funnel_leads` counts bucketed by date on the client.

**4. TrackingMatrix** — the heart. Rows = owner's videos (thumb + title). Columns = last 30 days, most recent first, horizontal scroll on mobile with sticky first column. Cell = unique viewers of that video on that date, derived from `video_view_events` (source-agnostic, so direct/funnel/landing all fold together — this is already how the table is written per `useVideoTracking`). Non-zero cells open a drill-down sheet listing each viewer: name/Anonymous, % watched, drop-off (`max_position`), CTA yes/no, last activity, plus filter chips (>50%, submitted, clicked). Row's left rail shows all-time total.

**5. PersonProfile drawer** — opened from any name. Shows lead contact + WA/Call at top, then full history: every video with % + drop-off, form submissions, CTA clicks, chronological timeline. Data comes from `video_view_events` joined on `fingerprint`/`lead_id`, plus `funnel_leads` and CTA events.

**6. AdvancedSection** — a single `<Collapsible>` block on the dashboard. Contains links to the existing Traffic Sources, Lead Attribution, Team Tracking, and per-surface (Videos/Funnels/Landing/Live) insights pages. Nothing is deleted; the routes still work, they just leave the main path.

## Files

New:
- `src/components/dashboard/LiveViewersBar.tsx` (replaces WatchingNowStrip usage)
- `src/components/dashboard/FollowUpToday.tsx`
- `src/components/dashboard/TodaysNumbers.tsx`
- `src/components/dashboard/TrackingMatrix.tsx`
- `src/components/dashboard/PersonProfileDrawer.tsx`
- `src/components/dashboard/AdvancedSection.tsx`
- `src/lib/followUp.ts` — score + WA message helpers

Edited:
- `src/pages/Dashboard.tsx` — new section order, drop old KPI strip + content rows from main path (moved into Advanced).
- `src/pages/TrackingPage.tsx` — becomes a thin wrapper around `TrackingMatrix` full-screen (keeps the `/tracking` route working from Advanced).

Untouched: `InsightsPage.tsx` and the four `insights/*` sub-pages — still reachable via Advanced. No new libraries. No schema changes.

## Data / accuracy

- % watched: `video_view_events.watch_position / duration_seconds` (already written by `useVideoTracking` heartbeats at 25/50/75/completion).
- Drop-off: `max_position` on the same row.
- Unique viewer per day: existing `nv_v_seen:*` sessionStorage guard + fingerprint. Matrix aggregates by `date_trunc('day', started_at)` + distinct `fingerprint`.
- Live: reuse `funnel_video_analytics` recent-events (last 60s) query, poll every 15s.
- Cross-surface unification: already true — `video_view_events` is the single writer for direct/funnel/landing/live.

## Mobile verification

After build, drive Playwright at 390×844 and confirm: live bar visible, follow-up list stacks cleanly, matrix scrolls horizontally with sticky first column, drawer opens full-height.

## Not doing

- No new realtime infra (Supabase Realtime channels) — polling only.
- No schema migrations. Everything reads existing tables.
- No changes to the video player, upload flow, or public share pages.
