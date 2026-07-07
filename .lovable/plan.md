# Finish-line plan — 3 steps to green

## Step 1 — SQL fix (you paste, ~5 sec)

Paste this exactly into Supabase SQL editor. It replaces `track_link_event_v2` with **only one line changed** — the `ON CONFLICT` clause now uses index inference instead of constraint-by-name. All other logic, security_definer, and search_path stay identical:

```sql
CREATE OR REPLACE FUNCTION public.track_link_event_v2(
  p_token text,
  p_step_id uuid,
  p_event_type text,
  p_fingerprint text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_link_id uuid;
  v_funnel_id uuid;
  v_ip text;
  v_ipua_hash text;
begin
  if p_event_type not in ('view','lead','complete') then
    return null;
  end if;

  select id, funnel_id into v_link_id, v_funnel_id
  from public.funnel_share_links
  where token = p_token and is_active = true;

  if v_link_id is null then return null; end if;

  begin
    v_ip := coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',
      current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip',
      ''
    );
  exception when others then
    v_ip := '';
  end;

  v_ipua_hash := encode(digest(coalesce(v_ip,'') || '|' || coalesce(p_user_agent,''), 'sha256'), 'hex');

  insert into public.link_events
    (share_link_id, funnel_id, funnel_step_id, event_type, visitor_fingerprint, ip_ua_hash, user_agent)
  values
    (v_link_id, v_funnel_id, p_step_id, p_event_type, p_fingerprint, v_ipua_hash, p_user_agent)
  on conflict (share_link_id, funnel_step_id, visitor_fingerprint)
    where (event_type = 'view' and visitor_fingerprint is not null)
    do nothing;

  if p_event_type <> 'view' then
    if not found then
      insert into public.link_events
        (share_link_id, funnel_id, funnel_step_id, event_type, visitor_fingerprint, ip_ua_hash, user_agent)
      values
        (v_link_id, v_funnel_id, p_step_id, p_event_type, p_fingerprint, v_ipua_hash, p_user_agent);
    end if;
  end if;

  return v_link_id;
end;
$function$;
```

**Why this works**: Postgres allows `ON CONFLICT` with an index-inference clause that matches a partial unique index. The partial index `uq_link_events_unique_view` already exists on those columns with that exact WHERE — so this just tells Postgres to use it directly, bypassing the constraint-name lookup that was failing.

## Step 2 — Deploy remaining edge functions (you)

From the Supabase dashboard, deploy these three (you already have them open):
- `get-funnel-data`
- `funnel-engagement-log`
- `get-r2-upload-url`

Or bulk via CLI: `supabase functions deploy --project-ref dnyjlmtiliqkpxwsgqyn`

## Step 3 — I verify + ship hardening (me)

Reply **"done"** and I'll (all in one build turn):

1. Query DB for the 3 funnel slugs (`2CC se 30 lakh...` + latest + any HEVC .mov)
2. Run Playwright playback verification on production, screenshot each playing frame
3. If green, publish current preview build to prod, re-verify once more
4. Implement hardening tweak 1 — HEVC/MOV/MKV/AVI upload advisory (client toast + `videos.format_warning` flag + owner-only badge on My Videos card)
5. Implement hardening tweak 2 — public player logs `MediaError.code` + video id on real playback error (console only; skip DB event table unless a trivially reusable path exists)
6. Final production verification with screenshots

## What stays off-limits

Per your constraints from earlier: no changes to accept list, size caps, contentType handling, or the public error UI beyond the two tweaks. No transcoding work.
