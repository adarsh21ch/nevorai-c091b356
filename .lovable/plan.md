Run this SQL in the Supabase SQL Editor. It replaces `record_view` so it uses Postgres built-in `sha256()` + `encode()` instead of `digest()` (which needs the missing `pgcrypto` extension). Everything else stays identical to the current version.

```sql
-- Fix: record_view was failing with
-- "function digest(text, unknown) does not exist"
-- Replace pgcrypto's digest() with built-in sha256() (PG 14+).

CREATE OR REPLACE FUNCTION public.record_view(
  p_source_type text,
  p_source_id   uuid,
  p_video_id    uuid,
  p_session_id  text,
  p_fingerprint text,
  p_device_type text,
  p_user_agent  text DEFAULT NULL,
  p_referrer    text DEFAULT NULL,
  p_country     text DEFAULT NULL,
  p_city        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id    uuid;
  v_fp_hash     text;
  v_owner_id    uuid;
  v_dedup_key   text;
BEGIN
  -- Hash fingerprint with built-in sha256 (no pgcrypto needed)
  v_fp_hash := encode(sha256(convert_to(coalesce(p_fingerprint, ''), 'UTF8')), 'hex');

  -- Resolve owner from source
  IF p_source_type = 'funnel' THEN
    SELECT user_id INTO v_owner_id FROM public.funnels WHERE id = p_source_id;
  ELSIF p_source_type = 'landing' THEN
    SELECT user_id INTO v_owner_id FROM public.landing_pages WHERE id = p_source_id;
  ELSIF p_source_type = 'live' THEN
    SELECT user_id INTO v_owner_id FROM public.live_sessions WHERE id = p_source_id;
  ELSIF p_source_type = 'direct' THEN
    SELECT user_id INTO v_owner_id FROM public.videos WHERE id = p_video_id;
  END IF;

  -- Dedup: same session + source within rolling window
  v_dedup_key := coalesce(p_session_id, v_fp_hash) || ':' || p_source_type || ':' || coalesce(p_source_id::text, p_video_id::text);

  SELECT id INTO v_event_id
  FROM public.video_view_events
  WHERE dedup_key = v_dedup_key
    AND started_at > now() - interval '30 minutes'
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    RETURN v_event_id;
  END IF;

  INSERT INTO public.video_view_events (
    video_id, source_type, source_id, owner_id,
    session_id, fingerprint_hash, device_type,
    user_agent, referrer, country, city,
    dedup_key, started_at
  ) VALUES (
    p_video_id, p_source_type, p_source_id, v_owner_id,
    p_session_id, v_fp_hash, p_device_type,
    p_user_agent, p_referrer, p_country, p_city,
    v_dedup_key, now()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_view(text, uuid, uuid, text, text, text, text, text, text, text) TO anon, authenticated, service_role;
```

After running it:
1. Play one funnel video.
2. Run the 5-minute check query again — expect a row with `source_type='funnel'`, non-null `session_id`, non-null `device_type`.

Note: this assumes the column names in `video_view_events` and the `record_view` argument list match what your previous migration created. If Postgres returns "column does not exist" or "function signature mismatch", tell me and I will pull the current schema before resubmitting.