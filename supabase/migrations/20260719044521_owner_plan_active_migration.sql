-- Public gating: when a creator's plan is disabled (e.g. Free tier turned off,
-- subscription expired, or plan flipped is_enabled=false in admin), their
-- publicly-shared funnels/videos/landing pages must show a neutral
-- "temporarily unavailable" screen to prospects.
--
-- This RPC is safe for anon: it returns ONLY a boolean and never exposes any
-- subscription details. Called from the public viewers before rendering.

create or replace function public.is_owner_plan_active(_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_subscriptions us
    left join public.subscription_plans sp on sp.plan_name = us.tier
    where us.user_id = _owner
      and us.status in ('active','trial','payment_failed','pending')
      and (us.expires_at is null or us.expires_at > now())
      and coalesce(sp.is_enabled, true) = true
  );
$$;

revoke all on function public.is_owner_plan_active(uuid) from public;
grant execute on function public.is_owner_plan_active(uuid) to anon, authenticated, service_role;
