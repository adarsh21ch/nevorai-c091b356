-- ============================================================
-- Unified Tracking Engine
-- ONE definition of Views (count(*)) + People (distinct fingerprint)
-- across video / funnel / landing / live, with blended per-video
-- rollup and Nev AI / Admin summary RPCs.
--
-- Safe to re-run. Builds on team_tracking_dashboard_migration.sql,
-- team_tracking_share_links_migration.sql and
-- unify_view_tracking_migration.sql which must already exist.
-- ============================================================

-- ---------- 1) Shape every *_view_events table the same way ----------

alter table if exists public.video_view_events
  add column if not exists visitor_fingerprint text,
  add column if not exists ip_ua_hash text,
  add column if not exists user_agent text;

alter table if exists public.funnel_view_events
  add column if not exists visitor_fingerprint text,
  add column if not exists ip_ua_hash text,
  add column if not exists user_agent text;

alter table if exists public.landing_page_view_events
  add column if not exists visitor_fingerprint text,
  add column if not exists ip_ua_hash text,
  add column if not exists user_agent text;

alter table if exists public.live_session_view_events
  add column if not exists visitor_fingerprint text,
  add column if not exists ip_ua_hash text,
  add column if not exists user_agent text;

create index if not exists idx_video_view_events_dedup
  on public.video_view_events (video_id, coalesce(visitor_fingerprint, ip_ua_hash));
create index if not exists idx_funnel_view_events_dedup
  on public.funnel_view_events (funnel_id, coalesce(visitor_fingerprint, ip_ua_hash));
create index if not exists idx_lp_view_events_dedup
  on public.landing_page_view_events (landing_page_id, coalesce(visitor_fingerprint, ip_ua_hash));
create index if not exists idx_live_view_events_dedup
  on public.live_session_view_events (live_session_id, coalesce(visitor_fingerprint, ip_ua_hash));

-- ---------- 2) Single entry-point RPC: record_view --------------------
-- Surfaces: 'video' | 'landing' | 'live'. (Funnels keep going through
-- track_funnel_event / link_events — single source of truth there.)

create or replace function public.record_view(
  p_surface text,
  p_entity_id uuid,
  p_fingerprint text default null,
  p_session_id text default null,
  p_user_agent text default null,
  p_referrer text default null,
  p_device text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_ua text;
  v_hash text;
  v_session text;
begin
  if p_entity_id is null then return; end if;

  -- Best-effort IP+UA fallback fingerprint (NULL-safe in non-HTTP context)
  begin
    v_ip := coalesce(
      current_setting('request.headers', true)::json->>'x-forwarded-for',
      current_setting('request.headers', true)::json->>'cf-connecting-ip',
      ''
    );
    v_ua := coalesce(current_setting('request.headers', true)::json->>'user-agent', '');
  exception when others then
    v_ip := ''; v_ua := '';
  end;
  v_hash := nullif(encode(digest(coalesce(p_user_agent,v_ua) || '|' || v_ip, 'sha256'), 'hex'), encode(digest('|', 'sha256'),'hex'));
  v_session := coalesce(nullif(p_session_id,''), encode(gen_random_bytes(8),'hex'));

  if p_surface = 'video' then
    insert into public.video_view_events
      (video_id, session_id, visitor_fingerprint, ip_ua_hash, user_agent, device_type, referrer_source)
    values
      (p_entity_id, v_session, nullif(p_fingerprint,''), v_hash, coalesce(p_user_agent,v_ua), p_device, p_referrer);

  elsif p_surface = 'landing' then
    insert into public.landing_page_view_events
      (landing_page_id, session_id, visitor_fingerprint, ip_ua_hash, user_agent, device_type, referrer_source)
    values
      (p_entity_id, v_session, nullif(p_fingerprint,''), v_hash, coalesce(p_user_agent,v_ua), p_device, p_referrer);

  elsif p_surface = 'live' then
    insert into public.live_session_view_events
      (live_session_id, session_id, visitor_fingerprint, ip_ua_hash, user_agent, device_type, referrer_source)
    values
      (p_entity_id, v_session, nullif(p_fingerprint,''), v_hash, coalesce(p_user_agent,v_ua), p_device, p_referrer);

  else
    raise exception 'unknown surface: %', p_surface;
  end if;
end;
$$;

grant execute on function public.record_view(text, uuid, text, text, text, text, text) to anon, authenticated;

-- ---------- 3) Derive video_assets.view_count from events ------------

create or replace function public.bump_video_view_count()
returns trigger language plpgsql as $$
begin
  update public.video_assets
     set view_count = coalesce(view_count, 0) + 1
   where id = NEW.video_id;
  return NEW;
end;
$$;

drop trigger if exists trg_bump_video_view_count on public.video_view_events;
create trigger trg_bump_video_view_count
  after insert on public.video_view_events
  for each row execute function public.bump_video_view_count();

-- ---------- 4) get_video_rollup: blended per-video totals -------------
-- direct + funnel (incl. steps) + landing + live, owner-scoped.

create or replace function public.get_video_rollup(
  p_from timestamptz default null,
  p_to timestamptz default null
) returns table (
  video_id uuid,
  title text,
  direct_views bigint,
  direct_unique bigint,
  funnel_views bigint,
  funnel_unique bigint,
  landing_views bigint,
  landing_unique bigint,
  live_views bigint,
  live_unique bigint,
  total_views bigint,
  total_unique bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_videos as (
    select id, title from public.video_assets where owner_id = auth.uid()
  ),
  direct as (
    select v.id as vid,
           count(*)::bigint as views,
           count(distinct coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id))::bigint as uniq
      from my_videos v
      left join public.video_view_events e on e.video_id = v.id
        and (p_from is null or e.started_at >= p_from)
        and (p_to   is null or e.started_at <  p_to)
     group by v.id
  ),
  funnel_videos as (
    -- videos that appear on a funnel root or any step
    select v.id as vid, f.id as funnel_id
      from my_videos v
      join public.funnels f on f.video_asset_id = v.id and f.owner_id = auth.uid()
    union
    select v.id, fs.funnel_id
      from my_videos v
      join public.funnel_steps fs on fs.video_asset_id = v.id
      join public.funnels f on f.id = fs.funnel_id and f.owner_id = auth.uid()
  ),
  funnel as (
    select v.id as vid,
           count(le.id)::bigint as views,
           count(distinct coalesce(le.visitor_fingerprint, le.ip_ua_hash))::bigint as uniq
      from my_videos v
      left join funnel_videos fv on fv.vid = v.id
      left join public.link_events le
        on le.funnel_id = fv.funnel_id
       and le.event_type = 'view'
       and (p_from is null or le.created_at >= p_from)
       and (p_to   is null or le.created_at <  p_to)
     group by v.id
  ),
  landing as (
    select v.id as vid,
           count(e.id)::bigint as views,
           count(distinct coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id))::bigint as uniq
      from my_videos v
      left join public.landing_pages lp
       on lp.post_submit_video_asset_id = v.id
       and lp.owner_id = auth.uid()
      left join public.landing_page_view_events e
        on e.landing_page_id = lp.id
       and (p_from is null or e.started_at >= p_from)
       and (p_to   is null or e.started_at <  p_to)
     group by v.id
  ),
  live as (
    select v.id as vid,
           count(e.id)::bigint as views,
           count(distinct coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id))::bigint as uniq
      from my_videos v
      left join public.live_sessions ls on ls.video_asset_id = v.id and ls.owner_id = auth.uid()
      left join public.live_session_view_events e
        on e.live_session_id = ls.id
       and (p_from is null or e.started_at >= p_from)
       and (p_to   is null or e.started_at <  p_to)
     group by v.id
  )
  select v.id, v.title,
         coalesce(d.views,0), coalesce(d.uniq,0),
         coalesce(f.views,0), coalesce(f.uniq,0),
         coalesce(l.views,0), coalesce(l.uniq,0),
         coalesce(li.views,0), coalesce(li.uniq,0),
         coalesce(d.views,0)+coalesce(f.views,0)+coalesce(l.views,0)+coalesce(li.views,0),
         coalesce(d.uniq,0)+coalesce(f.uniq,0)+coalesce(l.uniq,0)+coalesce(li.uniq,0)
    from my_videos v
    left join direct d  on d.vid  = v.id
    left join funnel f  on f.vid  = v.id
    left join landing l on l.vid  = v.id
    left join live li   on li.vid = v.id;
$$;

grant execute on function public.get_video_rollup(timestamptz, timestamptz) to authenticated;

-- ---------- 5) get_creator_insights_summary: one JSON for Nev AI -----

create or replace function public.get_creator_insights_summary(p_owner uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := coalesce(p_owner, auth.uid());
  v_now timestamptz := now();
  v_today timestamptz := date_trunc('day', v_now);
  v_7d timestamptz := v_now - interval '7 days';
  v_30d timestamptz := v_now - interval '30 days';
  v_funnel_ids uuid[];
  v_lp_ids uuid[];
  v_video_ids uuid[];
  v_live_ids uuid[];
  v_result jsonb;
  v_has_team boolean;
  v_team jsonb := null;
begin
  if v_owner is null then return '{}'::jsonb; end if;

  select array_agg(id) into v_funnel_ids from public.funnels       where owner_id = v_owner;
  select array_agg(id) into v_lp_ids     from public.landing_pages where owner_id = v_owner;
  select array_agg(id) into v_video_ids  from public.video_assets  where owner_id = v_owner;
  select array_agg(id) into v_live_ids   from public.live_sessions where owner_id = v_owner;

  with periods as (
    select * from (values
      ('today'::text,   v_today),
      ('last_7d'::text, v_7d),
      ('last_30d'::text,v_30d),
      ('all_time'::text, '-infinity'::timestamptz)
    ) as t(label, since)
  ),
  vv as (
    select 'video'::text as surface, started_at as ts,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp
      from public.video_view_events
     where v_video_ids is not null and video_id = any(v_video_ids)
  ),
  fv as (
    select 'funnel'::text, created_at,
           coalesce(visitor_fingerprint, ip_ua_hash)
      from public.link_events
     where v_funnel_ids is not null and funnel_id = any(v_funnel_ids)
       and event_type = 'view'
  ),
  lv as (
    select 'landing'::text, started_at,
           coalesce(visitor_fingerprint, ip_ua_hash, session_id)
      from public.landing_page_view_events
     where v_lp_ids is not null and landing_page_id = any(v_lp_ids)
  ),
  liv as (
    select 'live'::text, started_at,
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
    select s.surface,
           jsonb_build_object(
             'views',        count(*),
             'unique_views', count(distinct e.fp) filter (where e.fp is not null)
           ) as v
      from all_events e
      join (select unnest(array['video','funnel','landing','live']) as surface) s on s.surface = e.surface
     where e.ts >= v_30d
     group by s.surface
  ),
  top_videos as (
    select id, title,
           coalesce((select count(*) from public.video_view_events ev where ev.video_id = va.id), 0) as views,
           coalesce((select count(distinct coalesce(ev.visitor_fingerprint,ev.ip_ua_hash,ev.session_id))
                       from public.video_view_events ev where ev.video_id = va.id), 0) as uniq
      from public.video_assets va
     where va.owner_id = v_owner
     order by views desc
     limit 5
  ),
  top_funnels as (
    select f.id, f.title,
           coalesce((select count(*) from public.link_events le where le.funnel_id = f.id and le.event_type='view'),0) as views,
           coalesce((select count(distinct coalesce(le.visitor_fingerprint,le.ip_ua_hash))
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

  -- Team tracking summary (best-effort; only if get_team_tracking exists)
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

-- ---------- 6) Admin: platform-wide video stats + daily series -------

create or replace function public.get_admin_video_stats(
  p_from timestamptz default null,
  p_to timestamptz default null
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
language sql
stable
security definer
set search_path = public
as $$
  with auth_check as (
    select case when public.has_role(auth.uid(), 'admin') then 1 else 1/0 end as ok
  ),
  fp_video as (
    select video_id, coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp, started_at
      from public.video_view_events
     where (p_from is null or started_at >= p_from) and (p_to is null or started_at < p_to)
  ),
  fp_funnel as (
    select v.id as video_id, coalesce(le.visitor_fingerprint, le.ip_ua_hash) as fp, le.created_at as started_at
      from public.video_assets v
      join (
        select id as funnel_id, video_asset_id as vid from public.funnels where video_asset_id is not null
        union
        select funnel_id, video_asset_id as vid from public.funnel_steps where video_asset_id is not null
      ) fv on fv.vid = v.id
      join public.link_events le on le.funnel_id = fv.funnel_id and le.event_type = 'view'
       and (p_from is null or le.created_at >= p_from) and (p_to is null or le.created_at < p_to)
  ),
  fp_landing as (
    select v.id, coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id), e.started_at
      from public.video_assets v
      join public.landing_pages lp on (lp.video_asset_id = v.id or lp.post_submit_video_asset_id = v.id)
      join public.landing_page_view_events e on e.landing_page_id = lp.id
       and (p_from is null or e.started_at >= p_from) and (p_to is null or e.started_at < p_to)
  ),
  fp_live as (
    select v.id, coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id), e.started_at
      from public.video_assets v
      join public.live_sessions ls on ls.video_asset_id = v.id
      join public.live_session_view_events e on e.live_session_id = ls.id
       and (p_from is null or e.started_at >= p_from) and (p_to is null or e.started_at < p_to)
  ),
  all_fp as (
    select * from fp_video
    union all select * from fp_funnel
    union all select * from fp_landing
    union all select * from fp_live
  ),
  agg as (
    select video_id,
           count(*)::bigint as views,
           count(distinct fp) filter (where fp is not null)::bigint as people
      from all_fp
     group by video_id
  )
  select va.id, va.title, va.owner_id,
         coalesce(p.full_name, p.email, 'Unknown'),
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

create or replace function public.get_admin_video_daily(
  p_video_id uuid,
  p_days int default 30
) returns table (
  date date,
  views bigint,
  people bigint
)
language sql
stable
security definer
set search_path = public
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
  fp as (
    select started_at, coalesce(visitor_fingerprint, ip_ua_hash, session_id) as fp
      from public.video_view_events where video_id = p_video_id
        and started_at >= current_date - (p_days - 1)
    union all
    select le.created_at, coalesce(le.visitor_fingerprint, le.ip_ua_hash)
      from public.link_events le
      join (
        select id as funnel_id from public.funnels where video_asset_id = p_video_id
        union
        select funnel_id from public.funnel_steps where video_asset_id = p_video_id
      ) fv on fv.funnel_id = le.funnel_id
     where le.event_type = 'view' and le.created_at >= current_date - (p_days - 1)
    union all
    select e.started_at, coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id)
      from public.landing_page_view_events e
      join public.landing_pages lp on lp.id = e.landing_page_id
     where (lp.video_asset_id = p_video_id or lp.post_submit_video_asset_id = p_video_id)
       and e.started_at >= current_date - (p_days - 1)
    union all
    select e.started_at, coalesce(e.visitor_fingerprint, e.ip_ua_hash, e.session_id)
      from public.live_session_view_events e
      join public.live_sessions ls on ls.id = e.live_session_id
     where ls.video_asset_id = p_video_id
       and e.started_at >= current_date - (p_days - 1)
  )
  select d.d as date,
         count(fp.fp)::bigint as views,
         count(distinct fp.fp) filter (where fp.fp is not null)::bigint as people
    from days d
    left join fp on date_trunc('day', fp.started_at)::date = d.d
   where (select ok from auth_check) = 1
   group by d.d
   order by d.d;
$$;

grant execute on function public.get_admin_video_daily(uuid, int) to authenticated;
