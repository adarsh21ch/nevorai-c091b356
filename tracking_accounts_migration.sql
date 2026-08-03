-- Phase 2: Per-creator Meta Conversions API (CAPI) credentials.
--
-- Stores the pixel ID + access token + test_event_code per creator so we can
-- fire server-side CAPI events that dedupe with the browser fbq fire.
--
-- Security model:
--   * `access_token` is NEVER exposed to the client. There is no SELECT policy
--     for `authenticated`. Reads happen only through SECURITY DEFINER server
--     functions or `supabaseAdmin` inside server routes.
--   * Creators read a MASKED projection through a SECURITY DEFINER RPC.
--   * Writes go through a SECURITY DEFINER RPC that scopes to auth.uid().
--
-- Run idempotently in Supabase SQL editor.

create table if not exists public.tracking_accounts (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  pixel_id text,
  access_token text,                            -- raw; never read by clients
  test_event_code text,                         -- e.g. TEST12345; used in Meta Test Events tab
  capi_enabled boolean not null default false,
  advanced_matching_enabled boolean not null default true,
  last_test_at timestamptz,
  last_test_status text,                        -- 'ok' | 'error' | null
  last_test_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tracking_accounts_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_tracking_accounts_updated_at on public.tracking_accounts;
create trigger trg_tracking_accounts_updated_at
  before update on public.tracking_accounts
  for each row execute function public.tracking_accounts_touch_updated_at();

-- Lock down direct access. service_role still has full access for server code.
revoke all on public.tracking_accounts from anon, authenticated;
grant all on public.tracking_accounts to service_role;

alter table public.tracking_accounts enable row level security;
-- No policies for anon/authenticated == no rows visible to them.
-- All app access goes through the RPCs below.

-- ============================================================================
-- Masked read: lets the signed-in user see whether they've configured CAPI
-- and the last test result, without ever exposing the raw token.
-- ============================================================================
create or replace function public.get_my_tracking_account()
returns table (
  pixel_id text,
  test_event_code text,
  capi_enabled boolean,
  advanced_matching_enabled boolean,
  has_access_token boolean,
  access_token_preview text,                    -- 'EAAB...XYZ' style
  last_test_at timestamptz,
  last_test_status text,
  last_test_response jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.pixel_id,
    t.test_event_code,
    t.capi_enabled,
    t.advanced_matching_enabled,
    (t.access_token is not null and length(t.access_token) > 0) as has_access_token,
    case
      when t.access_token is null or length(t.access_token) < 8 then null
      else substr(t.access_token, 1, 4) || '…' || substr(t.access_token, length(t.access_token) - 3)
    end as access_token_preview,
    t.last_test_at,
    t.last_test_status,
    t.last_test_response,
    t.updated_at
  from public.tracking_accounts t
  where t.owner_id = auth.uid()
$$;

revoke all on function public.get_my_tracking_account() from public;
grant execute on function public.get_my_tracking_account() to authenticated;

-- ============================================================================
-- Upsert: writes the signed-in user's tracking config.
-- access_token is optional — pass null to leave the existing token unchanged.
-- Pass empty string '' to clear it.
-- ============================================================================
create or replace function public.upsert_my_tracking_account(
  _pixel_id text,
  _access_token text,                           -- null = keep existing; '' = clear
  _test_event_code text,
  _capi_enabled boolean,
  _advanced_matching_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.tracking_accounts (
    owner_id, pixel_id, access_token, test_event_code,
    capi_enabled, advanced_matching_enabled
  )
  values (
    _uid,
    nullif(_pixel_id, ''),
    case when _access_token is null then null
         when _access_token = '' then null
         else _access_token end,
    nullif(_test_event_code, ''),
    coalesce(_capi_enabled, false),
    coalesce(_advanced_matching_enabled, true)
  )
  on conflict (owner_id) do update set
    pixel_id = excluded.pixel_id,
    -- only overwrite token when caller explicitly sent a value (non-null)
    access_token = case
      when _access_token is null then public.tracking_accounts.access_token
      when _access_token = '' then null
      else _access_token
    end,
    test_event_code = excluded.test_event_code,
    capi_enabled = excluded.capi_enabled,
    advanced_matching_enabled = excluded.advanced_matching_enabled;
end
$$;

revoke all on function public.upsert_my_tracking_account(text, text, text, boolean, boolean) from public;
grant execute on function public.upsert_my_tracking_account(text, text, text, boolean, boolean) to authenticated;

-- ============================================================================
-- Test result writer (called from /api/public/capi/fire after a test event).
-- Service-role only.
-- ============================================================================
create or replace function public.write_tracking_test_result(
  _owner_id uuid,
  _status text,
  _response jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracking_accounts
     set last_test_at = now(),
         last_test_status = _status,
         last_test_response = _response
   where owner_id = _owner_id
$$;

revoke all on function public.write_tracking_test_result(uuid, text, jsonb) from public;
grant execute on function public.write_tracking_test_result(uuid, text, jsonb) to service_role;

-- ============================================================================
-- Resolve the active CAPI config for a public resource (funnel or landing).
-- Used server-side by /api/public/capi/fire. Returns NULL when the owner has
-- not enabled CAPI or has no token configured.
-- Returns the RAW token — service_role only.
-- ============================================================================
create or replace function public.resolve_capi_config_for_resource(
  _scope text,                                  -- 'funnel' | 'landing'
  _resource_id uuid
)
returns table (
  owner_id uuid,
  pixel_id text,
  access_token text,
  test_event_code text,
  advanced_matching_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner uuid;
  _resource_pixel text;
begin
  if _scope = 'funnel' then
    select f.owner_id, f.meta_pixel_id into _owner, _resource_pixel
      from public.funnels f where f.id = _resource_id;
  elsif _scope = 'landing' then
    select l.owner_id, l.meta_pixel_id into _owner, _resource_pixel
      from public.landing_pages l where l.id = _resource_id;
  else
    return;
  end if;

  if _owner is null then return; end if;

  return query
    select
      t.owner_id,
      coalesce(nullif(_resource_pixel, ''), t.pixel_id) as pixel_id,
      t.access_token,
      t.test_event_code,
      t.advanced_matching_enabled
    from public.tracking_accounts t
    where t.owner_id = _owner
      and t.capi_enabled = true
      and t.access_token is not null
      and length(t.access_token) > 0;
end
$$;

revoke all on function public.resolve_capi_config_for_resource(text, uuid) from public;
grant execute on function public.resolve_capi_config_for_resource(text, uuid) to service_role;
