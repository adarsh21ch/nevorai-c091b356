# Root cause: two server secrets are missing

## Answering your two questions first

**1. "Why Cloudflare Workers? We don't use Workers."**

You do — you just don't see it. Here's the split:

- **Cloudflare R2** = file storage (videos, thumbnails). You knew this.
- **Cloudflare Workers** = the runtime that executes your *server functions* (every `createServerFn` in the app, including `startVideoView`). Lovable deploys your TanStack Start backend onto Workers automatically. There is no separate "Lovable backend server" — Lovable IS Workers.
- **Supabase** = database + auth only. Your Workers call Supabase over HTTPS using the URL + service-role key.

So "set the env var in your production server runtime" = "add it as a **Lovable Project Secret**". Lovable injects project secrets into the Worker at request time as `process.env.X`. Nothing to do with Cloudflare's dashboard.

**2. "The SQL returned `Success. No rows returned`."**

That's the proof the fix isn't live yet. We expected today's funnel row to appear; it didn't, because the server function is still failing for the same reason every real-traffic insert has failed: it can't reach Supabase.

## The actual cause (confirmed)

I checked your project secrets. You have R2, Razorpay, Resend, Gemini, Meta, Google — but you do **not** have:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`src/integrations/supabase/client.server.ts` is the admin client used by `startVideoView`. Lines 10–14:

```ts
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server env");
}
```

Because these two secrets don't exist in the Worker runtime, **every** call to `startVideoView` throws before it can even attempt the `record_view` RPC. That's why:

- Funnel videos → no row.
- Direct video links → no row from real traffic either. The 3 rows in `video_view_events` are the May 27 backfill (identical microsecond timestamps, NULL session_id, NULL device_type — none of them came from the frontend player).
- Multi-step funnel "tracking" you thought was working is actually the older `funnel_engagement` pixel path (separate concern), not `video_view_events`.

This is consistent with every symptom you reported.

## The fix (one step, no code change, no SQL)

Add the two missing secrets to the Lovable project so the Worker can construct the admin client.

Values to paste (from your external Supabase project → Settings → API):

1. `SUPABASE_URL` = `https://<your-project-ref>.supabase.co`  
   (same value as your frontend `VITE_SUPABASE_URL`)
2. `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** secret (NOT the anon/publishable key) from Supabase → Settings → API → Project API keys → `service_role`. Keep it secret — it bypasses RLS.

Once added, the next published deploy will pick them up. No SQL, no code edit, no migration.

## How to verify (the only thing that proves it's fixed)

1. After the secrets are added and a new deploy is live, open one funnel in an incognito window and play the video for ~5 seconds.
2. Run this SQL — it should return exactly one row for that play:

```sql
select id, video_id, source_type, source_id, session_id, started_at, last_heartbeat_at, device_type
from public.video_view_events
where started_at > now() - interval '5 minutes'
order by started_at desc;
```

The row must have `source_type = 'funnel'`, a non-null `session_id`, and a non-null `device_type`. If it does, every other surface (direct, landing, live, future) starts recording at the same moment because they all go through the same `startVideoView` → `record_view` path.

## What I will NOT change

- No schema changes, no new tables, no edits to RLS.
- No code changes — the tracking pipeline itself is already correct; it's just unreachable until the secrets exist.
- No touching the existing funnel `funnel_engagement` pixel; separate concern.

## Action for you before I implement

I cannot read your Supabase service-role key. Please either:

- **(A)** Paste the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values here and I'll add them as Lovable secrets, **or**
- **(B)** Add them yourself in Lovable → Project Settings → Secrets, then tell me and I'll re-run the verification SQL with you.

Which do you prefer?
