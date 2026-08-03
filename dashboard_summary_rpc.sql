-- Phase 2 / Fix D: Single-RPC dashboard summary (run manually in Supabase SQL Editor)

create or replace function public.dashboard_summary(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_funnels     jsonb;
  v_total_leads bigint;
  v_active_live jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(f) order by f.created_at desc), '[]'::jsonb)
  into v_funnels
  from (
    select id, title, slug, is_published, total_views, total_leads,
           total_payments, created_at
    from public.funnels
    where owner_id = p_user_id
    order by created_at desc
    limit 10
  ) f;

  select count(*) into v_total_leads
  from public.funnel_leads fl
  where fl.funnel_id in (
    select id from public.funnels where owner_id = p_user_id
  );

  select to_jsonb(ls) into v_active_live
  from (
    select id, title
    from public.live_sessions
    where owner_id = p_user_id and status = 'live'
    limit 1
  ) ls;

  return jsonb_build_object(
    'funnels', v_funnels,
    'total_leads', coalesce(v_total_leads, 0),
    'active_live_session', v_active_live
  );
end;
$$;

grant execute on function public.dashboard_summary(uuid) to authenticated;
