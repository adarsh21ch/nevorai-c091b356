# New real cause — `digest()` function missing in `record_view`

## What the Worker log shows

```
[error] startVideoView (record_view) error: function digest(text, unknown) does not exist
```

This means:
- The secrets fix worked. The Worker successfully reached Supabase and called the `record_view` RPC.
- The RPC itself crashed inside Postgres because it calls `digest(...)` (the SHA-256 helper from the `pgcrypto` extension) and that extension isn't available on the `search_path` your RPC runs under.

That's why the `started_at > now() - interval '5 minutes'` query still returns zero rows — the insert is rolled back inside the function before any row is written.

## The fix (one SQL migration, no code change)

Recreate `public.record_view` so it computes the IP/UA hash using Postgres's built-in `sha256()` + `encode()` (available since PG 14, no extension required) instead of `digest()`. Everything else about the RPC — surface mapping, fingerprint handling, dedup, return value — stays identical to the version you ran last time.

### SQL to run in Supabase SQL editor

```sql
CREATE OR REPLACE FUNCTION public.record_view(
  p_surface     text,
  p_entity_id   uuid,
  p_fingerprint text DEFAULT NULL,
  p_session_id  text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL,
  p_referrer    text DEFAULT NULL,
  p_device      text DEFAULT NULL,
  p_source_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_type text;
  v_ip          inet;
  v_ip_ua_hash  text;
  v_event_id    uuid;
BEGIN
  v_source_type := CASE
    WHEN p_surface = 'video' THEN 'direct'
    WHEN p_surface IN ('direct','funnel','landing','live','course','other') THEN p_surface
    ELSE NULL
  END;
  IF v_source_type IS NULL THEN
    RAISE EXCEPTION 'record_view: invalid p_surface %', p_surface;
  END IF;

  -- Best-effort client IP (NULL if not present in request headers).
  BEGIN
    v_ip := nullif(current_setting('request.headers', true)::json->>'x-forwarded-for','')::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  -- Built-in SHA-256 — no pgcrypto dependency.
  v_ip_ua_hash := encode(
    sha256(convert_to(coalesce(host(v_ip),'') || '|' || coalesce(p_user_agent,''), 'UTF8')),
    'hex'
  );

  INSERT INTO public.video_view_events (
    video_id, source_type, source_id, session_id,
    fingerprint, user_agent, ip_ua_hash,
    referrer_source, device_type,
    started_at, last_heartbeat_at
  )
  VALUES (
    p_entity_id, v_source_type, p_source_id, p_session_id,
    p_fingerprint, p_user_agent, v_ip_ua_hash,
    p_referrer, p_device,
    now(), now()
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_view(text, uuid, text, text, text, text, text, uuid) TO anon, authenticated, service_role;
```

Notes:
- `sha256(bytea)` and `encode(bytea, 'hex')` are core Postgres — no extension to enable.
- `SECURITY DEFINER` + `SET search_path = public` keeps the bypass narrow.
- Signature and return type are unchanged from what your server function already calls, so no app code edit is needed.

## What I will NOT change

- No edits to `video_view_events` schema.
- No edits to RLS, GRANTs on the table, or any other surface.
- No code changes — `startVideoView` already calls `record_view` with the right arguments.
- No re-deploy of the app needed; the migration takes effect the moment it runs.

## Verify after running the SQL

1. Open a funnel video in incognito and play ~5 seconds.
2. Re-run the same SQL you just ran:

```sql
SELECT id, video_id, source_type, source_id, session_id, started_at, device_type
FROM public.video_view_events
WHERE started_at > now() - interval '5 minutes'
ORDER BY started_at DESC;
```

Expect one row with `source_type = 'funnel'`, non-null `session_id`, non-null `device_type`. If that row appears, every surface (direct/landing/live) starts recording from the same moment — they share the path.

If it still doesn't appear, send a screenshot and I'll pull the next Worker log immediately.
