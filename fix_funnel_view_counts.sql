-- =====================================================================
-- Nevorai — reconcile funnels.total_views with ground truth in link_events.
--
-- WHY: `funnels.total_views` is a running counter maintained by the
-- `trg_bump_funnel_total_views` trigger. If any historical rows were
-- inserted directly (bypassing the trigger), imported from another table,
-- or if the trigger was ever disabled, the counter can drift above or
-- below the real number of unique viewers.
--
-- This script recomputes `total_views` from the authoritative set:
-- one view per unique (share_link_id, funnel_step_id, fingerprint).
-- Safe to re-run any time — it only writes when a value actually changes.
-- =====================================================================
begin;

with truth as (
  select
    funnel_id,
    count(*)::int as unique_views
  from (
    select distinct
      funnel_id,
      share_link_id,
      funnel_step_id,
      coalesce(visitor_fingerprint, ip_ua_hash) as viewer
    from public.link_events
    where event_type = 'view'
      and coalesce(visitor_fingerprint, ip_ua_hash) is not null
  ) t
  group by funnel_id
)
update public.funnels f
   set total_views = coalesce(truth.unique_views, 0)
  from truth
 where f.id = truth.funnel_id
   and coalesce(f.total_views, 0) <> coalesce(truth.unique_views, 0);

-- Any funnels with zero events should show 0, not a stale positive number.
update public.funnels f
   set total_views = 0
 where coalesce(f.total_views, 0) > 0
   and not exists (
     select 1 from public.link_events e
      where e.funnel_id = f.id and e.event_type = 'view'
   );

commit;

-- Force PostgREST to reload so any changed columns are visible immediately.
notify pgrst, 'reload schema';
