# Team Tracking Dashboard — Phase 1

## Audit (what already exists)

- **Insights page** (`src/pages/InsightsPage.tsx`) is titled "Activity" on mobile. Tabs today: `overview | videos | funnels | landing-pages | live`. The "Recent Activity" feed lives inside the Overview tab — this is the "Activity tab" to merge into.
- **`funnel_share_links`** already exists with `owner_id`, `assigned_user_id`, `label`, `token`, `is_universal`, `is_active`.
- **`link_events`** already has `visitor_fingerprint` (single column, currently used as the dedup key) — NOT `visitor_id` + `ip_ua_hash` as two columns. There's a partial unique index on `(share_link_id, funnel_step_id, visitor_fingerprint)` for views.
- **`funnel_leads`** already has `share_link_id`. Phone column needs verification for `phone_normalized`.
- **`team_connections`** already exists (`upline_id`, `member_id`, status). Connect flow via `/join/$token` is live.
- Existing RPC `team_tracking_stats(funnel_id, from, to)` returns per-link × per-step counts for ONE funnel — not the cross-funnel team matrix this dashboard needs.
- Public viewer already sets a visitor fingerprint and calls `track_link_event`.

## Decisions (reconciling the brief with reality)

1. **Reuse `visitor_fingerprint`** as the dedup key — it already plays the role of `visitor_id` (localStorage UUID). Add an `ip_ua_hash` column as the secondary fallback (new). Frontend continues setting `nev_visitor_id` in localStorage; we'll rename/alias on the way in.
2. **Cross-funnel matrix RPC** is new: `get_team_tracking(p_from, p_to)` returning the nested JSON shape in the brief, scoped to caller's funnels and their connected team members.
3. **"Team member"** = the calling user + every `team_connections.member_id` where `upline_id = auth.uid()` and `status='active'`. Rows are grouped by `funnel_share_links.assigned_user_id` (NULL → owner's own row).
4. **Lead dedup** by normalized phone (last 10 digits) per funnel. Add `phone_normalized` generated column on `funnel_leads`.
5. **Merge into Activity tab**: add a segment toggle at the top of the Overview tab — `My Activity` (existing feed) | `Team Tracking` (new dashboard). Default = Team Tracking if any active team connections exist, else My Activity. Also add a Profile menu deep link.
6. **Columns = funnels.** Per-user order stored in new `tracking_column_config.funnel_order uuid[]`.
7. **Labels**: new `team_labels` table; `funnel_share_links.label_id` (the label rides on the share-link row, which is per member × per funnel — fine because the dashboard groups by member and the label is the same across that member's links; we'll enforce uniformity via an upsert helper that stamps all that member's links).

## SQL (new migration `team_tracking_dashboard_migration.sql`)

```sql
-- Secondary fallback dedup key
alter table public.link_events add column if not exists ip_ua_hash text;
create index if not exists idx_link_events_dedup
  on public.link_events (share_link_id, funnel_id,
    coalesce(visitor_fingerprint, ip_ua_hash));

-- Normalized phone for lead dedup
alter table public.funnel_leads
  add column if not exists phone_normalized text
  generated always as (right(regexp_replace(coalesce(phone,''),'\D','','g'),10)) stored;
create index if not exists idx_funnel_leads_phone_norm
  on public.funnel_leads(funnel_id, phone_normalized);

-- Labels
create table public.team_labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
-- + GRANTs + RLS (owner-only)
alter table public.funnel_share_links
  add column if not exists label_id uuid references public.team_labels(id) on delete set null;

-- Column order config
create table public.tracking_column_config (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  funnel_order uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
-- + GRANTs + RLS

-- RPC: cross-funnel matrix
create or replace function public.get_team_tracking(
  p_from timestamptz default null, p_to timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$ ... $$;
-- Returns: { funnels:[{id,name}], members:[{id,name,is_you,label_id,
--   funnels:[{funnel_id,viewers,leads}], total_viewers,total_leads}],
--   totals:{per_funnel:[{funnel_id,viewers,leads}],grand_viewers,grand_leads} }
-- Dedup: count(distinct coalesce(visitor_fingerprint, ip_ua_hash)) per (member,funnel)
-- Leads: count(distinct phone_normalized) where phone_normalized <> ''

-- RPC: label CRUD helpers + assign_label_to_member(member_id, label_id) that
-- updates all share_links where assigned_user_id = member_id AND owner_id = auth.uid()
```

## Frontend

### New files
- `src/lib/teamTracking.ts` — typed RPC wrappers + React Query hooks (`useTeamTracking`, `useTeamLabels`, `useColumnConfig`).
- `src/components/insights/TeamTrackingDashboard.tsx` — KPIs, date filter, sticky-left Excel table, totals row/column, member expand, label chips filter, column-config gear, sort-by-total, CSV export.
- `src/components/insights/TeamTrackingSegment.tsx` — segmented control toggling `My Activity` vs `Team Tracking`.
- `src/components/insights/ColumnConfigDialog.tsx` — drag/reorder funnels.
- `src/components/insights/LabelManagerDialog.tsx` — CRUD labels + assign per-member.
- `src/components/insights/ExportCsvButton.tsx` (already in codebase context list — reuse or create).

### Edits
- `src/pages/InsightsPage.tsx` — wrap the existing Overview "Recent Activity" card in the new segment; render `TeamTrackingDashboard` when selected.
- `src/pages/ProfilePage.tsx` — add a "Team Tracking" link.
- Public viewer (`PublicFunnel`/wherever `track_link_event` is called) — ensure `nev_visitor_id` localStorage UUID is sent as `visitor_fingerprint`; compute and pass `ip_ua_hash` server-side from request headers via a thin server function wrapping `track_link_event` (so IP is never trusted from the client). Add a new RPC `track_link_event_v2(token, step_id, type, visitor_id, ua)` that hashes `inet_client_addr() || ua`.

## UX details

- KPI row: Team total viewers (big), "Your viewers: X" under it; secondary line "Team leads: X · Your leads: X". Date filter chips: Today / 7d / 30d (default) / All.
- Table: sticky first column (Member), funnel columns, Totals column. Each cell: big viewers number + small muted leads. Bottom Totals row. Tap row → expand showing per-funnel breakdown + that member's share link URLs (copyable).
- Mobile: horizontal scroll, sticky left, big tap targets.
- Empty states for no team / no data.

## Acceptance verification

After build, run a SQL test: insert 3 `link_events` with same `visitor_fingerprint` on one share_link → RPC must return `viewers=1`. Insert 2 leads with phones `+919812345678` and `9812345678` → `leads=1`.

## Out of scope (Phase 2)

- Trend arrows vs previous period (will add only if cheap).
- Reassigning share links between members.
- Per-step breakdown in the matrix (existing `team_tracking_stats` per-funnel drill-down stays available via the member-expand panel).
