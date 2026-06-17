-- ============================================================
-- Unified Video Tracking v2  (Nevorai)
-- Single source of truth for ALL video numbers = video_view_events.
-- Views   = count(*)
-- People  = count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))
-- Surfaces are tagged via source_type ('direct'|'funnel'|'landing'|'live'|...).
-- A NEW surface = a new source_type value. No schema or rollup change.
--
-- Safe to re-run. Builds on unified_tracking_engine_migration.sql.
-- ============================================================

-- ---------- 1) Make sure video_view_events can carry surface tags ----

alter table if exists public.video_view_events
  add column if not exists source_type text not null default 'direct',
  add column if not exists source_id   uuid;

create index if not exists idx_vve_video_source
  on public.video_view_events (video_id, source_type, source_id);

create index if not exists idx_vve_started_at
  on public.video_view_events (started_at);

-- ---------- 2) get_video_rollup: derive from ONE table ---------------

drop function if exists public.get_video_rollup(timestamptz, timestamptz);

create or replace function public.get_video_rollup(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (
  video_id uuid,
  title text,
  direct_views   bigint, direct_people   bigint,
  funnel_views   bigint, funnel_people   bigint,
  landing_views  bigint, landing_people  bigint,
  live_views     bigint, live_people     bigint,
  other_views    bigint, other_people    bigint,
  total_views    bigint, total_people    bigint
)
language sql stable security definer set search_path = public
as $$
  with my_videos as (
    select id, title from public.video_assets where owner_id = auth.uid()
  ),
  ev as (
    select e.video_id,
           coalesce(nullif(e.source_type,''),'direct') as src,
           coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id) as fp
      from public.video_view_events e
      join my_videos v on v.id = e.video_id
     where (p_from is null or e.started_at >= p_from)
       and (p_to   is null or e.started_at <  p_to)
  )
  select v.id, v.title,
    count(*) filter (where ev.src='direct')::bigint,
    count(distinct ev.fp) filter (where ev.src='direct')::bigint,
    count(*) filter (where ev.src='funnel')::bigint,
    count(distinct ev.fp) filter (where ev.src='funnel')::bigint,
    count(*) filter (where ev.src='landing')::bigint,
    count(distinct ev.fp) filter (where ev.src='landing')::bigint,
    count(*) filter (where ev.src='live')::bigint,
    count(distinct ev.fp) filter (where ev.src='live')::bigint,
    count(*) filter (where ev.src not in ('direct','funnel','landing','live'))::bigint,
    count(distinct ev.fp) filter (where ev.src not in ('direct','funnel','landing','live'))::bigint,
    count(ev.video_id)::bigint,
    count(distinct ev.fp)::bigint
  from my_videos v
  left join ev on ev.video_id = v.id
  group by v.id, v.title;
$$;

grant execute on function public.get_video_rollup(timestamptz, timestamptz) to authenticated;

-- ---------- 3) Admin: platform-wide video stats (one table) ----------

drop function if exists public.get_admin_video_stats(timestamptz, timestamptz);

create or replace function public.get_admin_video_stats(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (
  video_id uuid,
  title text,
  uploader_id uuid,
  uploader_name text,
  status text,
  size_bytes bigint,
  created_at timestamptz,
  views bigint,
  people bigint
)
language sql stable security definer set search_path = public
as $$
  with auth_check as (
    select case when public.has_role(auth.uid(), 'admin') then 1 else 1/0 end as ok
  ),
  agg as (
    select video_id,
           count(*)::bigint as views,
           count(distinct coalesce(visitor_fingerprint, ip_ua_hash, session_id))::bigint as people
      from public.video_view_events
     where (p_from is null or started_at >= p_from)
       and (p_to   is null or started_at <  p_to)
     group by video_id
  )
  select va.id, va.title, va.owner_id,
         coalesce(p.display_name, p.username, 'Unknown'),
         va.status::text,
         va.file_size_bytes::bigint,
         va.created_at,
         coalesce(a.views, 0),
         coalesce(a.people, 0)
    from public.video_assets va
    left join public.profiles p on p.id = va.owner_id
    left join agg a on a.video_id = va.id
   where (select ok from auth_check) = 1
   order by va.created_at desc;
$$;

grant execute on function public.get_admin_video_stats(timestamptz, timestamptz) to authenticated;

-- ---------- 4) Admin: per-video daily series (one table) -------------

drop function if exists public.get_admin_video_daily(uuid, int);

create or replace function public.get_admin_video_daily(
  p_video_id uuid,
  p_days int default 30
) returns table (
  date date,
  views bigint,
  people bigint
)
language sql stable security definer set search_path = public
as $$
  with auth_check as (
    select case when public.has_role(auth.uid(), 'admin') then 1 else 1/0 end as ok
  ),
  days as (
    select generate_series(
      (current_date - (p_days - 1))::date,
      current_date::date,
      interval '1 day'
    )::date as d
  ),
  ev as (
    select started_at,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp
      from public.video_view_events
     where video_id = p_video_id
       and started_at >= current_date - (p_days - 1)
  )
  select d.d as date,
         count(ev.started_at)::bigint as views,
         count(distinct ev.fp) filter (where ev.fp is not null)::bigint as people
    from days d
    left join ev on date_trunc('day', ev.started_at)::date = d.d
   where (select ok from auth_check) = 1
   group by d.d
   order by d.d;
$$;

grant execute on function public.get_admin_video_daily(uuid, int) to authenticated;

-- ---------- 5) Nev AI: align by_surface + top_videos with one table --

create or replace function public.get_creator_insights_summary(p_owner uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_owner uuid := coalesce(p_owner, auth.uid());
  v_now timestamptz := now();
  v_today timestamptz := date_trunc('day', v_now);
  v_7d   timestamptz := v_now - interval '7 days';
  v_30d  timestamptz := v_now - interval '30 days';
  v_funnel_ids uuid[];
  v_lp_ids uuid[];
  v_video_ids uuid[];
  v_live_ids uuid[];
  v_result jsonb;
  v_team jsonb := null;
  v_has_team boolean;
begin
  if v_owner is null then return '{}'::jsonb; end if;

  select array_agg(id) into v_funnel_ids from public.funnels       where owner_id = v_owner;
  select array_agg(id) into v_lp_ids     from public.landing_pages where owner_id = v_owner;
  select array_agg(id) into v_video_ids  from public.video_assets  where owner_id = v_owner;
  select array_agg(id) into v_live_ids   from public.live_sessions where owner_id = v_owner;

  with periods as (
    select * from (values
      ('today'::text,    v_today),
      ('last_7d'::text,  v_7d),
      ('last_30d'::text, v_30d),
      ('all_time'::text, '-infinity'::timestamptz)
    ) as t(label, since)
  ),
  -- ALL video plays from the single source of truth, tagged by surface.
  vv as (
    select coalesce(nullif(source_type,''),'direct') as surface,
           started_at as ts,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp
      from public.video_view_events
     where v_video_ids is not null and video_id = any(v_video_ids)
  ),
  -- Page-level (non-video) events still tracked separately so we don't
  -- lose funnel/landing/live page opens that never reached the video.
  fv as (
    select 'funnel_page'::text as surface, created_at as ts,
           coalesce(visitor_fingerprint, ip_ua_hash) as fp
      from public.link_events
     where v_funnel_ids is not null and funnel_id = any(v_funnel_ids)
       and event_type = 'view'
  ),
  lv as (
    select 'landing_page'::text, started_at,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.landing_page_view_events
     where v_lp_ids is not null and landing_page_id = any(v_lp_ids)
  ),
  liv as (
    select 'live_page'::text, started_at,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.live_session_view_events
     where v_live_ids is not null and live_session_id = any(v_live_ids)
  ),
  all_events as (
    select * from vv union all select * from fv union all select * from lv union all select * from liv
  ),
  leads_all as (
    select submitted_at as ts from public.funnel_leads
      where v_funnel_ids is not null and funnel_id = any(v_funnel_ids)
    union all
    select submitted_at from public.landing_page_registrations
      where owner_id = v_owner
  ),
  period_totals as (
    select p.label,
           jsonb_build_object(
             'views',        (select count(*) from all_events e where e.ts >= p.since),
             'unique_views', (select count(distinct e.fp) from all_events e where e.ts >= p.since and e.fp is not null),
             'leads',        (select count(*) from leads_all l where l.ts >= p.since)
           ) as v
      from periods p
  ),
  by_surface as (
    select e.surface,
           jsonb_build_object(
             'views',        count(*),
             'unique_views', count(distinct e.fp) filter (where e.fp is not null)
           ) as v
      from all_events e
     where e.ts >= v_30d
     group by e.surface
  ),
  top_videos as (
    select va.id, va.title,
           coalesce((select count(*) from public.video_view_events ev where ev.video_id = va.id), 0) as views,
           coalesce((select count(distinct coalesce(ev.visitor_fingerprint, ev.ip_ua_hash, ev.session_id))
                       from public.video_view_events ev where ev.video_id = va.id), 0) as uniq
      from public.video_assets va
     where va.owner_id = v_owner
     order by views desc
     limit 5
  ),
  top_funnels as (
    select f.id, f.title,
           coalesce((select count(*) from public.link_events le where le.funnel_id = f.id and le.event_type='view'),0) as views,
           coalesce((select count(distinct coalesce(le.visitor_fingerprint, le.ip_ua_hash))
                       from public.link_events le where le.funnel_id = f.id and le.event_type='view'),0) as uniq,
           coalesce((select count(*) from public.funnel_leads fl where fl.funnel_id = f.id),0) as leads
      from public.funnels f
     where f.owner_id = v_owner
     order by views desc
     limit 5
  )
  select jsonb_build_object(
    'period_totals', (select jsonb_object_agg(label, v) from period_totals),
    'by_surface',    coalesce((select jsonb_object_agg(surface, v) from by_surface), '{}'::jsonb),
    'top_videos',    coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'total_views',views,'total_unique',uniq)) from top_videos), '[]'::jsonb),
    'top_funnels',   coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'views',views,'unique_views',uniq,'leads',leads)) from top_funnels), '[]'::jsonb),
    'generated_at',  v_now
  ) into v_result;

  begin
    select exists(
      select 1 from public.funnel_share_links sl
       where sl.owner_id = v_owner and sl.assigned_user_id <> v_owner
    ) into v_has_team;
    if v_has_team then
      select to_jsonb(t) into v_team
        from (
          select count(distinct assigned_user_id) as members
            from public.funnel_share_links where owner_id = v_owner
        ) t;
      v_result := v_result || jsonb_build_object('team_tracking', v_team);
    end if;
  exception when others then null;
  end;

  return v_result;
end;
$$;

grant execute on function public.get_creator_insights_summary(uuid) to authenticated;

-- ---------- 6) Optional one-time backfill (commented) ----------------
-- Uncomment to seed historical funnel/landing/live video plays into
-- video_view_events so legacy data shows up in the new rollup.
--
-- insert into public.video_view_events (video_id, source_type, source_id, session_id, visitor_fingerprint, ip_ua_hash, started_at)
-- select v.id, 'funnel', fv.funnel_id, encode(gen_random_bytes(8),'hex'),
--        le.visitor_fingerprint, le.ip_ua_hash, le.created_at
--   from public.link_events le
--   join (
--     select id as funnel_id, video_asset_id as vid from public.funnels       where video_asset_id is not null
--     union
--     select funnel_id,         video_asset_id as vid from public.funnel_steps where video_asset_id is not null
--   ) fv on fv.funnel_id = le.funnel_id
--   join public.video_assets v on v.id = fv.vid
--  where le.event_type = 'view';
