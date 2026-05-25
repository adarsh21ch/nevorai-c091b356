-- ─── whatsapp_bot_pauses ──────────────────────────────────────────
-- Per-phone bot pause. When a phone is in this table, the webhook
-- still logs inbound messages but does NOT auto-reply — letting an
-- admin take over the conversation manually from the dashboard.

CREATE TABLE IF NOT EXISTS public.whatsapp_bot_pauses (
  phone_number text PRIMARY KEY,
  paused_at    timestamptz NOT NULL DEFAULT now(),
  paused_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason       text
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bot_pauses_paused_at
  ON public.whatsapp_bot_pauses(paused_at DESC);

ALTER TABLE public.whatsapp_bot_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage bot pauses" ON public.whatsapp_bot_pauses;
CREATE POLICY "Admins manage bot pauses"
  ON public.whatsapp_bot_pauses FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Service role manages bot pauses" ON public.whatsapp_bot_pauses;
CREATE POLICY "Service role manages bot pauses"
  ON public.whatsapp_bot_pauses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
