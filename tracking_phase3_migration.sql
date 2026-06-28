-- =====================================================================
-- Phase 3: Encrypt CAPI tokens at rest + retry queue + diagnostics RPCs
--
-- Idempotent: safe to run multiple times. Paste into Supabase SQL editor.
--
-- This migration does FOUR things:
--   1. Encrypts tracking_accounts.access_token using pgcrypto + a vault key
--      (the raw token column stays for one release as a fallback, then can
--      be dropped via the commented block at the bottom).
--   2. Rewrites upsert / resolve / get RPCs to read/write the encrypted column.
--   3. Adds capi_fire_queue + RPCs for the retry worker.
--   4. Adds get_my_capi_diagnostics() for the /tracking verification panel.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------
-- 1) Vault-stored encryption key for CAPI tokens
-- ------------------------------------------------------------------
-- Supabase ships the `vault` schema with managed secret storage. We mint
-- one symmetric key per project (32 random bytes, hex-encoded) and read
-- it from inside SECURITY DEFINER functions only. Browser code never
-- sees this key.
do $$
declare
  _exists boolean;
begin
  select exists(select 1 from vault.secrets where name = 'capi_token_key') into _exists;
  if not _exists then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'capi_token_key');
  end if;
end $$;

create or replace function public._capi_key() returns text
language sql stable security definer set search_path = vault, public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'capi_token_key' limit 1
$$;
revoke all on function public._capi_key() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2) Add ciphertext column + backfill from plaintext
-- ------------------------------------------------------------------
alter table public.tracking_accounts
  add column if not exists access_token_encrypted bytea;

update public.tracking_accounts
   set access_token_encrypted = extensions.pgp_sym_encrypt(access_token, public._capi_key())
 where access_token is not null
   and length(access_token) > 0
   and access_token_encrypted is null;

-- ------------------------------------------------------------------
-- 3) Rewrite RPCs to use the encrypted column
-- ------------------------------------------------------------------

-- Masked read (no token leaks)
create or replace function public.get_my_tracking_account()
returns table (
  pixel_id text,
  test_event_code text,
  capi_enabled boolean,
  advanced_matching_enabled boolean,
  has_access_token boolean,
  access_token_preview text,
  last_test_at timestamptz,
  last_test_status text,
  last_test_response jsonb,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with d as (
    select
      t.*,
      case
        when t.access_token_encrypted is not null then
          extensions.pgp_sym_decrypt(t.access_token_encrypted, public._capi_key())
        else t.access_token
      end as _tok
    from public.tracking_accounts t
    where t.owner_id = auth.uid()
  )
  select
    d.pixel_id,
    d.test_event_code,
    d.capi_enabled,
    d.advanced_matching_enabled,
    (d._tok is not null and length(d._tok) > 0) as has_access_token,
    case
      when d._tok is null or length(d._tok) < 8 then null
      else substr(d._tok, 1, 4) || '…' || substr(d._tok, length(d._tok) - 3)
    end as access_token_preview,
    d.last_test_at,
    d.last_test_status,
    d.last_test_response,
    d.updated_at
  from d
$$;
grant execute on function public.get_my_tracking_account() to authenticated;

-- Upsert: encrypts on write. _access_token semantics:
--   null  -> keep existing
--   ''    -> clear
--   else  -> encrypt + store
create or replace function public.upsert_my_tracking_account(
  _pixel_id text,
  _access_token text,
  _test_event_code text,
  _capi_enabled boolean,
  _advanced_matching_enabled boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _new_cipher bytea;
begin
  if _uid is null then raise exception 'not_authenticated'; end if;

  if _access_token is null then
    _new_cipher := null;  -- "keep existing"; handled below
  elsif _access_token = '' then
    _new_cipher := null;  -- "clear"
  else
    _new_cipher := extensions.pgp_sym_encrypt(_access_token, public._capi_key());
  end if;

  insert into public.tracking_accounts (
    owner_id, pixel_id, access_token_encrypted, test_event_code,
    capi_enabled, advanced_matching_enabled
  ) values (
    _uid,
    nullif(_pixel_id, ''),
    case when _access_token = '' then null else _new_cipher end,
    nullif(_test_event_code, ''),
    coalesce(_capi_enabled, false),
    coalesce(_advanced_matching_enabled, true)
  )
  on conflict (owner_id) do update set
    pixel_id = excluded.pixel_id,
    access_token_encrypted = case
      when _access_token is null then public.tracking_accounts.access_token_encrypted
      when _access_token = '' then null
      else _new_cipher
    end,
    -- mirror the clear/replace into the legacy plaintext column so RPCs
    -- that still read it don't return stale data. New tokens never land in plaintext.
    access_token = case
      when _access_token is null then public.tracking_accounts.access_token
      when _access_token = '' then null
      else null
    end,
    test_event_code = excluded.test_event_code,
    capi_enabled = excluded.capi_enabled,
    advanced_matching_enabled = excluded.advanced_matching_enabled;
end $$;
grant execute on function public.upsert_my_tracking_account(text, text, text, boolean, boolean) to authenticated;

-- Resolve config for a public funnel/landing — returns plaintext token to service_role caller only.
create or replace function public.resolve_capi_config_for_resource(
  _scope text,
  _resource_id uuid
)
returns table (
  owner_id uuid,
  pixel_id text,
  access_token text,
  test_event_code text,
  advanced_matching_enabled boolean
)
language plpgsql security definer set search_path = public as $$
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
  else return;
  end if;
  if _owner is null then return; end if;

  return query
    select
      t.owner_id,
      coalesce(nullif(_resource_pixel, ''), t.pixel_id) as pixel_id,
      coalesce(
        extensions.pgp_sym_decrypt(t.access_token_encrypted, public._capi_key()),
        t.access_token
      ) as access_token,
      t.test_event_code,
      t.advanced_matching_enabled
    from public.tracking_accounts t
    where t.owner_id = _owner
      and t.capi_enabled = true
      and (
        (t.access_token_encrypted is not null)
        or (t.access_token is not null and length(t.access_token) > 0)
      );
end $$;
grant execute on function public.resolve_capi_config_for_resource(text, uuid) to service_role;

-- Decrypt for the test-event server fn (service_role only).
create or replace function public.read_my_capi_token_for_owner(_owner_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    extensions.pgp_sym_decrypt(access_token_encrypted, public._capi_key()),
    access_token
  )
  from public.tracking_accounts where owner_id = _owner_id
$$;
grant execute on function public.read_my_capi_token_for_owner(uuid) to service_role;

-- ------------------------------------------------------------------
-- 4) capi_fire_queue: retry storage for failed server-side fires
-- ------------------------------------------------------------------
create table if not exists public.capi_fire_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pixel_id text not null,
  scope text not null check (scope in ('funnel', 'landing')),
  resource_id uuid not null,
  event_name text not null,
  event_id text not null,
  payload jsonb not null,
  attempts int not null default 0,
  status text not null default 'pending' check (status in ('pending','sent','dead')),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capi_fire_queue_due_idx
  on public.capi_fire_queue (status, next_attempt_at)
  where status = 'pending';
create index if not exists capi_fire_queue_owner_idx
  on public.capi_fire_queue (owner_id, status);

revoke all on public.capi_fire_queue from anon, authenticated;
grant all on public.capi_fire_queue to service_role;
alter table public.capi_fire_queue enable row level security;
-- No policies for anon/authenticated. Service-role only.

create or replace function public.enqueue_capi_fire(
  _owner_id uuid, _pixel_id text, _scope text, _resource_id uuid,
  _event_name text, _event_id text, _payload jsonb, _last_error text
) returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  insert into public.capi_fire_queue (
    owner_id, pixel_id, scope, resource_id, event_name, event_id, payload, last_error, next_attempt_at
  ) values (
    _owner_id, _pixel_id, _scope, _resource_id, _event_name, _event_id, _payload, _last_error,
    now() + interval '1 minute'
  ) returning id into _id;
  return _id;
end $$;
grant execute on function public.enqueue_capi_fire(uuid, text, text, uuid, text, text, jsonb, text) to service_role;

-- Claim up to _limit due rows; FOR UPDATE SKIP LOCKED so concurrent drains don't collide.
create or replace function public.claim_capi_fires(_limit int)
returns setof public.capi_fire_queue
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.capi_fire_queue
     where status = 'pending' and next_attempt_at <= now()
     order by next_attempt_at
     limit _limit
     for update skip locked
  )
  update public.capi_fire_queue q
     set attempts = q.attempts + 1, updated_at = now()
    from picked
   where q.id = picked.id
   returning q.*;
end $$;
grant execute on function public.claim_capi_fires(int) to service_role;

-- Mark a single row as sent or schedule its next retry (exponential backoff).
create or replace function public.complete_capi_fire(
  _id uuid, _ok boolean, _error text
) returns void language plpgsql security definer set search_path = public as $$
declare
  _row public.capi_fire_queue;
  _delay interval;
begin
  select * into _row from public.capi_fire_queue where id = _id;
  if _row.id is null then return; end if;

  if _ok then
    update public.capi_fire_queue set status = 'sent', last_error = null, updated_at = now() where id = _id;
    return;
  end if;

  -- Backoff: 1m, 5m, 30m, 2h, 12h, then dead.
  _delay := case _row.attempts
    when 1 then interval '5 minutes'
    when 2 then interval '30 minutes'
    when 3 then interval '2 hours'
    when 4 then interval '12 hours'
    else null
  end;

  if _delay is null then
    update public.capi_fire_queue
       set status = 'dead', last_error = _error, updated_at = now()
     where id = _id;
  else
    update public.capi_fire_queue
       set next_attempt_at = now() + _delay, last_error = _error, updated_at = now()
     where id = _id;
  end if;
end $$;
grant execute on function public.complete_capi_fire(uuid, boolean, text) to service_role;

-- ------------------------------------------------------------------
-- 5) Diagnostics RPC for /tracking verification panel
-- ------------------------------------------------------------------
create or replace function public.get_my_capi_diagnostics()
returns table (
  queue_pending bigint,
  queue_dead bigint,
  last_fire_at timestamptz,
  recent jsonb
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select * from public.pixel_fire_log
     where owner_id = auth.uid()
     order by created_at desc
     limit 5
  ),
  q as (
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'dead') as dead
    from public.capi_fire_queue where owner_id = auth.uid()
  )
  select
    q.pending,
    q.dead,
    (select max(created_at) from public.pixel_fire_log where owner_id = auth.uid()),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'created_at', created_at,
        'event_name', event_name,
        'success', success,
        'is_test', is_test,
        'scope', scope
      )) from mine),
      '[]'::jsonb
    )
  from q
$$;
grant execute on function public.get_my_capi_diagnostics() to authenticated;

-- ------------------------------------------------------------------
-- 6) (Optional, run AFTER you've confirmed all tokens are migrated)
--    Drop the plaintext column. Uncomment the line below and re-run.
-- ------------------------------------------------------------------
-- alter table public.tracking_accounts drop column if exists access_token;

-- ------------------------------------------------------------------
-- 7) pg_cron snippet for the retry worker (run separately in Supabase
--    Dashboard → Database → Extensions → enable pg_cron + pg_net, then
--    Database → Cron Jobs → New). Replace <PROJECT> and <SECRET>.
-- ------------------------------------------------------------------
-- select cron.schedule(
--   'capi-drain-every-minute',
--   '* * * * *',
--   $$ select net.http_post(
--        url := 'https://<PROJECT>.lovable.app/api/public/capi/drain',
--        headers := jsonb_build_object('x-drain-secret','<SECRET>')
--      ); $$
-- );
