-- =====================================================================
-- NEVORAI FIX PACK — signup/signin "Database error" + video upload 500
-- Safe to run multiple times. Run the whole file in Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: resolve (or create) a user's personal tenant
-- ---------------------------------------------------------------------
create or replace function public.ensure_personal_tenant(_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t_id uuid;
  u_email text;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if _user_id is null then
    return null;
  end if;

  select tm.tenant_id into t_id
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = _user_id
    and tm.role = 'owner'
    and coalesce(t.kind, 'personal') = 'personal'
    and t.deleted_at is null
  order by t.created_at asc
  limit 1;

  if t_id is not null then
    return t_id;
  end if;

  select email into u_email from auth.users where id = _user_id;
  base_slug := regexp_replace(lower(coalesce(split_part(u_email, '@', 1), 'user')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or base_slug is null then base_slug := 'user'; end if;
  final_slug := base_slug;
  while exists (select 1 from public.tenants where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n::text;
  end loop;

  insert into public.tenants (name, slug, kind, plan, status)
  values (coalesce(u_email, 'My Space'), final_slug, 'personal', 'individual', 'active')
  returning id into t_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (t_id, _user_id, 'owner')
  on conflict do nothing;

  return t_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. AUTH: make signup triggers tenant-aware AND non-blocking.
--    Any failure inside these must NEVER block auth.users insert,
--    otherwise Supabase returns "Database error saving new user".
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_id uuid;
begin
  begin
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile insert failed: %', sqlerrm;
  end;

  begin
    t_id := public.ensure_personal_tenant(new.id);
  exception when others then
    raise warning 'handle_new_user: tenant creation failed: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.create_free_subscription_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_plan text;
begin
  begin
    select plan_name into default_plan
    from public.subscription_plans
    where coalesce(is_active, true) = true
    order by coalesce(monthly_price, 0) asc, display_order asc
    limit 1;

    if default_plan is null then
      return new;
    end if;

    insert into public.user_subscriptions (user_id, tier, status, started_at)
    values (new.id, default_plan, 'trial', now())
    on conflict do nothing;
  exception when others then
    raise warning 'create_free_subscription_for_new_user failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. UPLOADS: auto-fill tenant_id on insert.
--    Edge functions (get-r2-upload-url, etc.) insert rows without
--    tenant_id. If the column is NOT NULL the insert 500s ->
--    "Edge Function returned a non-2xx status code".
--    This trigger fills tenant_id from the row's owner automatically.
-- ---------------------------------------------------------------------
create or replace function public.autofill_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(new);
  uid uuid;
  t_id uuid;
begin
  if row_json ? 'tenant_id' and (row_json->>'tenant_id') is not null then
    return new;
  end if;

  uid := coalesce(
    nullif(row_json->>'owner_id', '')::uuid,
    nullif(row_json->>'user_id', '')::uuid,
    nullif(row_json->>'created_by', '')::uuid,
    auth.uid()
  );

  if uid is null then
    return new;
  end if;

  t_id := public.ensure_personal_tenant(uid);
  if t_id is null then
    return new;
  end if;

  new := jsonb_populate_record(new, jsonb_build_object('tenant_id', t_id));
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('tenants', 'tenant_members')
  loop
    execute format('drop trigger if exists trg_autofill_tenant_id on public.%I', r.table_name);
    execute format(
      'create trigger trg_autofill_tenant_id before insert on public.%I
       for each row execute function public.autofill_tenant_id()',
      r.table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Backfill any existing rows missing a tenant
-- ---------------------------------------------------------------------
update public.video_assets v
set tenant_id = public.ensure_personal_tenant(v.owner_id)
where v.tenant_id is null and v.owner_id is not null;

-- ---------------------------------------------------------------------
-- 4. DIAGNOSTICS — run these and paste the output back if anything
--    still fails.
-- ---------------------------------------------------------------------
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- select column_name, is_nullable, data_type from information_schema.columns
--   where table_schema='public' and table_name='video_assets' order by ordinal_position;
-- select count(*) from public.video_assets where tenant_id is null;
