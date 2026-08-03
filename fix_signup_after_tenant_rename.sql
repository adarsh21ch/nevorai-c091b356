-- ============================================================================
-- FIX: "Database error saving new user" on signup (POST /auth/v1/signup → 500)
--
-- Cause: handle_new_user() still writes to pre-rename objects
--        (public.workspaces / public.workspace_members / profiles.workspace_id)
--        and creates the personal space with plan='free', which no longer
--        satisfies the tenants.plan check constraint ('individual' | 'leader').
--
-- This rewrite:
--   * resolves table/column names at runtime (tenants/tenant_members/tenant_id,
--     falling back to the old workspace names if still present)
--   * uses plan='individual' (constraint-safe)
--   * NEVER aborts signup: tenant provisioning is wrapped in an exception
--     handler, so a future schema change can degrade but not block signups
--   * is idempotent — safe to re-run
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_tbl   text;
  v_member_tbl   text;
  v_fk_col       text;
  v_tenant_id    uuid;
  v_full_name    text;
  v_phone        text;
  v_slug         text;
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_phone     := new.raw_user_meta_data ->> 'phone';

  -- 1) Profile row (must succeed; the app depends on it)
  insert into public.profiles (id, full_name, email, phone)
  values (new.id, v_full_name, new.email, v_phone)
  on conflict (id) do nothing;

  -- 2) Personal tenant + membership (best-effort, never blocks signup)
  begin
    v_tenant_tbl := case
      when to_regclass('public.tenants')    is not null then 'tenants'
      when to_regclass('public.workspaces') is not null then 'workspaces'
    end;
    v_member_tbl := case
      when to_regclass('public.tenant_members')    is not null then 'tenant_members'
      when to_regclass('public.workspace_members') is not null then 'workspace_members'
    end;

    if v_tenant_tbl is not null and v_member_tbl is not null then
      v_fk_col := case
        when exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = v_member_tbl and column_name = 'tenant_id'
        ) then 'tenant_id'
        else 'workspace_id'
      end;

      v_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g')
                || '-' || substr(replace(new.id::text, '-', ''), 1, 6);

      execute format(
        'insert into public.%I (name, slug, owner_id, kind, plan) values ($1, $2, $3, %L, %L) returning id',
        v_tenant_tbl, 'personal', 'individual'
      )
      using coalesce(v_full_name, 'My Space') || '''s Space', v_slug, new.id
      into v_tenant_id;

      execute format(
        'insert into public.%I (%I, user_id, role) values ($1, $2, ''owner'') on conflict do nothing',
        v_member_tbl, v_fk_col
      )
      using v_tenant_id, new.id;

      -- link profile to the tenant when the column exists
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'tenant_id'
      ) then
        update public.profiles set tenant_id = v_tenant_id where id = new.id;
      elsif exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'workspace_id'
      ) then
        update public.profiles set workspace_id = v_tenant_id where id = new.id;
      end if;
    end if;
  exception when others then
    raise warning 'handle_new_user: tenant provisioning skipped for % (%)', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Make sure the trigger exists and points at the rewritten function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Diagnostics: list every remaining trigger on auth.users (should be just ours
-- plus any Supabase-internal ones). If another custom trigger shows up here and
-- signup still 500s, that trigger is the next suspect.
select tgname, pg_get_triggerdef(t.oid)
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
