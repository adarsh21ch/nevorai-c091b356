-- ============================================================================
-- unique_views_single_metric_migration.sql
--
-- Goal: one user-facing metric across the product = "Views" (unique people).
-- A single person opening a video/funnel/landing/live N times counts ONCE.
--
-- This migration is ADDITIVE: it adds RPCs + indexes + grants. It does NOT
-- drop tables, columns, or existing functions; it does NOT backfill data.
--
-- Run in Supabase SQL Editor as a single transaction. Safe to re-run.
--
-- "Unique person" key (in priority order, first non-null wins):
--   coalesce(visitor_fingerprint, ip_ua_hash, session_id)
-- Same key the existing get_creator_insights_summary RPC uses, so numbers
-- across surfaces stay consistent.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Helper: route entity_type -> table, return unique-person count in window
-- ----------------------------------------------------------------------------
create or replace function public.get_unique_people(
  p_entity_type text,           -- 'video' | 'funnel' | 'landing_page' | 'live'
  p_entity_id   uuid,
  p_from        timestamptz default null,
  p_to          timestamptz default null
) returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count bigint := 0;
  v_from  timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  v_to    timestamptz := coalesce(p_to,   'infinity'::timestamptz);
begin
  if p_entity_id is null then return 0; end if;

  if p_entity_type = 'video' then
    select count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))
      into v_count
      from public.video_view_events
     where video_id = p_entity_id
       and started_at >= v_from
       and started_at <  v_to
       and coalesce(visitor_fingerprint, ip_ua_hash, session_id) is not null;

  elsif p_entity_type = 'funnel' then
    select count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))
      into v_count
      from public.funnel_view_events
     where funnel_id = p_entity_id
       and started_at >= v_from
       and started_at <  v_to
       and coalesce(visitor_fingerprint, ip_ua_hash, session_id) is not null;

  elsif p_entity_type = 'landing_page' then
    select count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))
      into v_count
      from public.landing_page_view_events
     where landing_page_id = p_entity_id
       and started_at >= v_from
       and started_at <  v_to
       and coalesce(visitor_fingerprint, ip_ua_hash, session_id) is not null;

  elsif p_entity_type = 'live' then
    select count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))
      into v_count
      from public.live_session_view_events
     where live_session_id = p_entity_id
       and started_at >= v_from
       and started_at <  v_to
       and coalesce(visitor_fingerprint, ip_ua_hash, session_id) is not null;

  else
    raise exception 'get_unique_people: unknown entity_type %', p_entity_type;
  end if;

  return coalesce(v_count, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Per-owner rollup. ONE call returns the totals every Dashboard /
--    Insights hero / Analytics page needs.
--
--    total_people  -> deduped across ALL surfaces owned by this user
--                     (a person who watched a video AND a landing page
--                     counts ONCE).
--    video_people / funnel_people / landing_people / live_people
--                  -> deduped within that surface only (sum != total).
-- ----------------------------------------------------------------------------
create or replace function public.get_owner_unique_people(
  p_owner_id uuid,
  p_from     timestamptz default null,
  p_to       timestamptz default null
) returns table(
  total_people     bigint,
  video_people     bigint,
  funnel_people    bigint,
  landing_people   bigint,
  live_people      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  v_to   timestamptz := coalesce(p_to,   'infinity'::timestamptz);
begin
  if p_owner_id is null then
    return query select 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  return query
  with
    video_ids   as (select id from public.video_assets  where owner_id = p_owner_id),
    funnel_ids  as (select id from public.funnels       where owner_id = p_owner_id),
    lp_ids      as (select id from public.landing_pages where owner_id = p_owner_id),
    live_ids    as (select id from public.live_sessions where owner_id = p_owner_id),

    vv as (
      select coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
        from public.video_view_events e
        join video_ids v on v.id = e.video_id
       where e.started_at >= v_from and e.started_at < v_to
    ),
    fv as (
      select coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
        from public.funnel_view_events e
        join funnel_ids f on f.id = e.funnel_id
       where e.started_at >= v_from and e.started_at < v_to
    ),
    lv as (
      select coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
        from public.landing_page_view_events e
        join lp_ids lp on lp.id = e.landing_page_id
       where e.started_at >= v_from and e.started_at < v_to
    ),
    liv as (
      select coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
        from public.live_session_view_events e
        join live_ids ls on ls.id = e.live_session_id
       where e.started_at >= v_from and e.started_at < v_to
    ),
    all_events as (
      select fp from vv  union all
      select fp from fv  union all
      select fp from lv  union all
      select fp from liv
    )
  select
    (select count(distinct fp) from all_events where fp is not null)::bigint as total_people,
    (select count(distinct fp) from vv         where fp is not null)::bigint as video_people,
    (select count(distinct fp) from fv         where fp is not null)::bigint as funnel_people,
    (select count(distinct fp) from lv         where fp is not null)::bigint as landing_people,
    (select count(distinct fp) from liv        where fp is not null)::bigint as live_people;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Per-owner DAILY unique-people series (drives Dashboard "today" KPI
--    and 7-day / 30-day trend strip).
--
--    Returns one row per day in [p_from, p_to]. people = unique persons
--    deduped across all four surfaces for THAT calendar day.
-- ----------------------------------------------------------------------------
create or replace function public.get_owner_unique_people_daily(
  p_owner_id uuid,
  p_from     date,
  p_to       date
) returns table(day date, people bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_owner_id is null or p_from is null or p_to is null then
    return; -- empty
  end if;

  return query
  with
    days as (
      select generate_series(p_from, p_to, interval '1 day')::date as d
    ),
    video_ids   as (select id from public.video_assets  where owner_id = p_owner_id),
    funnel_ids  as (select id from public.funnels       where owner_id = p_owner_id),
    lp_ids      as (select id from public.landing_pages where owner_id = p_owner_id),
    live_ids    as (select id from public.live_sessions where owner_id = p_owner_id),

    events as (
      select (e.started_at at time zone 'UTC')::date as d,
             coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
        from public.video_view_events e
        join video_ids v on v.id = e.video_id
       where (e.started_at at time zone 'UTC')::date between p_from and p_to
      union all
      select (e.started_at at time zone 'UTC')::date,
             coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id)
        from public.funnel_view_events e
        join funnel_ids f on f.id = e.funnel_id
       where (e.started_at at time zone 'UTC')::date between p_from and p_to
      union all
      select (e.started_at at time zone 'UTC')::date,
             coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id)
        from public.landing_page_view_events e
        join lp_ids lp on lp.id = e.landing_page_id
       where (e.started_at at time zone 'UTC')::date between p_from and p_to
      union all
      select (e.started_at at time zone 'UTC')::date,
             coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id)
        from public.live_session_view_events e
        join live_ids ls on ls.id = e.live_session_id
       where (e.started_at at time zone 'UTC')::date between p_from and p_to
    )
  select d.d as day,
         coalesce((
           select count(distinct fp)
             from events ev
            where ev.d = d.d and ev.fp is not null
         ), 0)::bigint as people
    from days d
   order by d.d;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Platform-wide unique people for admin KPIs.
--    NOTE: counts unique persons globally (a person who used many creators
--    in the window is one). Use within a sensible window (e.g. last 30 days)
--    — full-history scans on large data sets can be slow.
-- ----------------------------------------------------------------------------
create or replace function public.get_platform_unique_people(
  p_from timestamptz,
  p_to   timestamptz
) returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  with all_events as (
    select coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp
      from public.video_view_events
     where started_at >= p_from and started_at < p_to
    union all
    select coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.funnel_view_events
     where started_at >= p_from and started_at < p_to
    union all
    select coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.landing_page_view_events
     where started_at >= p_from and started_at < p_to
    union all
    select coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.live_session_view_events
     where started_at >= p_from and started_at < p_to
  )
  select count(distinct fp) into v_count
    from all_events
   where fp is not null;

  return coalesce(v_count, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Indexes the RPCs above rely on. All IF NOT EXISTS — safe to re-run.
-- ----------------------------------------------------------------------------
create index if not exists video_view_events_video_time_idx
  on public.video_view_events (video_id, started_at);

create index if not exists video_view_events_dedup_v2_idx
  on public.video_view_events (video_id, coalesce(visitor_fingerprint, ip_ua_hash, session_id));

create index if not exists funnel_view_events_funnel_time_idx
  on public.funnel_view_events (funnel_id, started_at);

create index if not exists funnel_view_events_dedup_v2_idx
  on public.funnel_view_events (funnel_id, coalesce(visitor_fingerprint, ip_ua_hash, session_id));

create index if not exists landing_page_view_events_lp_time_idx
  on public.landing_page_view_events (landing_page_id, started_at);

create index if not exists landing_page_view_events_dedup_v2_idx
  on public.landing_page_view_events (landing_page_id, coalesce(visitor_fingerprint, ip_ua_hash, session_id));

create index if not exists live_session_view_events_live_time_idx
  on public.live_session_view_events (live_session_id, started_at);

create index if not exists live_session_view_events_dedup_v2_idx
  on public.live_session_view_events (live_session_id, coalesce(visitor_fingerprint, ip_ua_hash, session_id));

-- ----------------------------------------------------------------------------
-- 6) Grants. anon needs get_unique_people (public funnel pages display
--    a viewer count). The owner / platform rollups stay authenticated-only.
-- ----------------------------------------------------------------------------
grant execute on function public.get_unique_people(text, uuid, timestamptz, timestamptz)
  to authenticated, anon;

grant execute on function public.get_owner_unique_people(uuid, timestamptz, timestamptz)
  to authenticated;

grant execute on function public.get_owner_unique_people_daily(uuid, date, date)
  to authenticated;

grant execute on function public.get_platform_unique_people(timestamptz, timestamptz)
  to authenticated;

commit;

-- ============================================================================
-- Quick sanity checks (run separately, replace <uuid> with a real user id):
--
--   select * from public.get_owner_unique_people('<uuid>'::uuid, now() - interval '30 days', now());
--   select * from public.get_owner_unique_people_daily('<uuid>'::uuid, current_date - 7, current_date);
--   select public.get_platform_unique_people(now() - interval '7 days', now());
--   select public.get_unique_people('funnel', '<funnel-uuid>'::uuid, null, null);
-- ============================================================================
