-- ============================================================================
-- NEVORAI FIX PACK
-- 1) Signup 500 ("Database error saving new user") — both auth.users triggers
-- 2) Video playback diagnostics (video_assets.public_url)
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1A. handle_new_user(): tenant-aware, never fatal
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_table text;
  v_member_table text;
  v_fk_col       text;
  v_tenant_id    uuid;
  v_name         text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  -- profile first: signup must never fail because of tenant provisioning
  begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, v_name)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user profile insert failed: %', sqlerrm;
  end;

  begin
    select case when to_regclass('public.tenants') is not null then 'tenants'
                when to_regclass('public.workspaces') is not null then 'workspaces' end
      into v_tenant_table;

    select case when to_regclass('public.tenant_members') is not null then 'tenant_members'
                when to_regclass('public.workspace_members') is not null then 'workspace_members' end
      into v_member_table;

    if v_tenant_table is not null and v_member_table is not null then
      v_fk_col := case when v_tenant_table = 'tenants' then 'tenant_id' else 'workspace_id' end;

      execute format(
        'insert into public.%I (name, kind, plan, owner_id) values ($1, %L, %L, $2) returning id',
        v_tenant_table, 'personal', 'individual'
      ) into v_tenant_id using coalesce(v_name, 'My Space') || '''s Space', new.id;

      execute format(
        'insert into public.%I (%I, user_id, role) values ($1, $2, %L) on conflict do nothing',
        v_member_table, v_fk_col, 'owner'
      ) using v_tenant_id, new.id;

      -- link profile if the column exists
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = v_fk_col
      ) then
        execute format('update public.profiles set %I = $1 where id = $2', v_fk_col)
          using v_tenant_id, new.id;
      end if;
    end if;
  exception when others then
    raise warning 'handle_new_user tenant provisioning failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1B. create_free_subscription_for_new_user(): never fatal, valid plan only
-- ----------------------------------------------------------------------------
create or replace function public.create_free_subscription_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  begin
    -- pick a plan that actually exists; prefer the cheapest active one
    select plan_name into v_plan
    from public.subscription_plans
    where coalesce(is_active, true)
    order by coalesce(monthly_price, 0) asc, display_order asc
    limit 1;

    if v_plan is null then
      return new;  -- nothing valid to assign; do not block signup
    end if;

    insert into public.user_subscriptions (user_id, plan_name, status)
    values (new.id, v_plan, 'trial')
    on conflict do nothing;
  exception when others then
    raise warning 'create_free_subscription_for_new_user failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1C. Re-attach triggers
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_create_free_subscription on auth.users;
create trigger trg_create_free_subscription
  after insert on auth.users
  for each row execute function public.create_free_subscription_for_new_user();

-- ----------------------------------------------------------------------------
-- 2. VIDEO DIAGNOSTICS — run and send me the output
-- ----------------------------------------------------------------------------
select count(*) filter (where public_url is null)                as null_url,
       count(*) filter (where public_url is not null)            as with_url,
       count(*)                                                  as total
from public.video_assets;

select split_part(split_part(public_url, '//', 2), '/', 1) as host,
       count(*) as videos
from public.video_assets
where public_url is not null
group by 1
order by 2 desc;

select id, title, status, public_url, created_at
from public.video_assets
where public_url is not null
order by created_at desc
limit 5;
