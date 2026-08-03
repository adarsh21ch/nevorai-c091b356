-- Run in Supabase SQL editor.
-- Links each captured lead to the viewing session that submitted it,
-- so the creator dashboard can show real-time watch status & last-seen.

ALTER TABLE public.funnel_leads
  ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS funnel_leads_funnel_session_idx
  ON public.funnel_leads (funnel_id, session_id);

-- Helps the dashboard query (live/last-seen by session).
CREATE INDEX IF NOT EXISTS funnel_view_events_funnel_session_idx
  ON public.funnel_view_events (funnel_id, session_id, last_heartbeat_at DESC);
