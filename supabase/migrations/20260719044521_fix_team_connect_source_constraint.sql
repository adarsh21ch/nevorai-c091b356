-- =====================================================================
-- Nevorai — Team Connect hard fix
-- Fixes: new row for relation "team_connections" violates check constraint
--        "team_connections_source_check"
--
-- Why it happened:
--   The app was sending paste / qr_scan / qr_upload, but the database check
--   allowed only connect_link / qr / email_invite / manual.
--
-- Safe to re-run.
-- =====================================================================

-- 1) Make sure profile connect tokens exist and are generated without
--    pgcrypto.gen_random_bytes().
alter table public.profiles
  add column if not exists connect_token text unique;

create or replace function public.profiles_set_connect_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.connect_token is null or btrim(new.connect_token) = '' then
    loop
      new.connect_token := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      exit when not exists (
        select 1 from public.profiles p where p.connect_token = new.connect_token
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_connect_token on public.profiles;
create trigger trg_profiles_set_connect_token
  before insert on public.profiles
  for each row execute function public.profiles_set_connect_token();

do $$
declare
  r record;
  v_token text;
begin
  for r in select id from public.profiles where connect_token is null or btrim(connect_token) = '' loop
    loop
      v_token := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      exit when not exists (select 1 from public.profiles where connect_token = v_token);
    end loop;
    update public.profiles set connect_token = v_token where id = r.id;
  end loop;
end;
$$;

-- 2) Make sure the core connection table exists, has Data API grants, and
--    accepts both canonical and older UI source values.
create table if not exists public.team_connections (
  id uuid primary key default gen_random_uuid(),
  upline_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  source text not null default 'connect_link',
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (upline_id, member_id),
  check (upline_id <> member_id)
);

grant select, insert, update on public.team_connections to authenticated;
grant all on public.team_connections to service_role;

alter table public.team_connections enable row level security;

create index if not exists idx_team_conn_upline
  on public.team_connections(upline_id) where status = 'active';
create index if not exists idx_team_conn_member
  on public.team_connections(member_id) where status = 'active';

alter table public.team_connections
  drop constraint if exists team_connections_status_check;
alter table public.team_connections
  add constraint team_connections_status_check
  check (status in ('active','revoked'));

alter table public.team_connections
  drop constraint if exists team_connections_source_check;
alter table public.team_connections
  add constraint team_connections_source_check
  check (source in ('connect_link','qr','email_invite','manual','paste','qr_scan','qr_upload'));

drop policy if exists "team_conn_upline_read" on public.team_connections;
drop policy if exists "team_conn_member_read" on public.team_connections;
drop policy if exists "team_conn_upline_update" on public.team_connections;

create policy "team_conn_upline_read"
  on public.team_connections for select to authenticated
  using (auth.uid() = upline_id);

create policy "team_conn_member_read"
  on public.team_connections for select to authenticated
  using (auth.uid() = member_id);

create policy "team_conn_upline_update"
  on public.team_connections for update to authenticated
  using (auth.uid() = upline_id)
  with check (auth.uid() = upline_id);

-- 3) Share token generation without pgcrypto.gen_random_bytes().
create or replace function public.gen_share_token()
returns text
language sql
volatile
as $$
  select lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));
$$;

grant execute on function public.gen_share_token() to authenticated, service_role;

-- 4) Ensure a personal share link exists for every connected member/funnel.
create or replace function public.ensure_member_share_link(
  p_funnel_id uuid,
  p_member_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_existing uuid;
  v_token text;
  v_label text;
  v_link_id uuid;
begin
  select owner_id into v_owner from public.funnels where id = p_funnel_id;
  if v_owner is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.team_connections
    where upline_id = v_owner
      and member_id = p_member_id
      and status = 'active'
  ) then
    return null;
  end if;

  select id into v_existing
  from public.funnel_share_links
  where funnel_id = p_funnel_id
    and assigned_user_id = p_member_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select coalesce(nullif(full_name, ''), nullif(email, ''), 'Team Member')
    into v_label
  from public.profiles
  where id = p_member_id;

  loop
    v_token := public.gen_share_token();
    exit when not exists (select 1 from public.funnel_share_links where token = v_token);
  end loop;

  insert into public.funnel_share_links
    (funnel_id, owner_id, label, token, assigned_user_id, is_universal, is_active)
  values
    (p_funnel_id, v_owner, coalesce(v_label, 'Team Member'), v_token, p_member_id, false, true)
  returning id into v_link_id;

  return v_link_id;
end;
$$;

grant execute on function public.ensure_member_share_link(uuid, uuid) to authenticated, service_role;

-- 5) Main connect RPC. It now sanitizes any UI source into safe DB values,
--    so paste, QR scan, QR upload, and old links all connect successfully.
create or replace function public.connect_to_upline(
  p_token text,
  p_source text default 'connect_link'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upline uuid;
  v_member uuid := auth.uid();
  v_conn_id uuid;
  v_funnel uuid;
  v_source text;
begin
  if v_member is null then
    raise exception 'must be signed in';
  end if;

  select id into v_upline
  from public.profiles
  where connect_token = btrim(coalesce(p_token, ''));

  if v_upline is null then
    raise exception 'invalid connect token';
  end if;

  if v_upline = v_member then
    raise exception 'cannot connect to yourself';
  end if;

  v_source := case lower(btrim(coalesce(p_source, 'connect_link')))
    when 'qr' then 'qr'
    when 'qr_scan' then 'qr'
    when 'qr_upload' then 'qr'
    when 'scan' then 'qr'
    when 'upload' then 'qr'
    when 'email_invite' then 'email_invite'
    when 'manual' then 'manual'
    when 'paste' then 'connect_link'
    when 'link' then 'connect_link'
    else 'connect_link'
  end;

  insert into public.team_connections (upline_id, member_id, source, status, revoked_at)
  values (v_upline, v_member, v_source, 'active', null)
  on conflict (upline_id, member_id) do update
    set status = 'active',
        revoked_at = null,
        source = excluded.source
  returning id into v_conn_id;

  for v_funnel in
    select id from public.funnels where owner_id = v_upline
  loop
    perform public.ensure_member_share_link(v_funnel, v_member);
  end loop;

  return v_conn_id;
end;
$$;

grant execute on function public.connect_to_upline(text, text) to authenticated;

-- 6) Backfill personal share links for any active team connection that was
--    created before this fix.
do $$
declare
  r record;
begin
  for r in
    select tc.member_id, f.id as funnel_id
    from public.team_connections tc
    join public.funnels f on f.owner_id = tc.upline_id
    left join public.funnel_share_links sl
      on sl.funnel_id = f.id and sl.assigned_user_id = tc.member_id
    where tc.status = 'active'
      and sl.id is null
  loop
    perform public.ensure_member_share_link(r.funnel_id, r.member_id);
  end loop;
end;
$$;

-- 7) Verification queries you can run after this script:
-- SELECT public.gen_share_token();
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.team_connections'::regclass
--   AND conname = 'team_connections_source_check';