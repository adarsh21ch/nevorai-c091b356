# Tracking system hardening — Phase 3

You picked all four. I'll ship them in one consolidated migration + a focused code pass. Order matters: encryption first (so the retry queue stores ciphertext from day one), then dedupe reconciliation, then queue, then verification UI.

## 1. New migration: `tracking_phase3_migration.sql`

Single file you paste into Supabase SQL editor. Idempotent. Contains:

**a) Encrypt `tracking_accounts.access_token` at rest (pgsodium)**
- Enable `pgsodium` extension.
- Add `access_token_encrypted bytea` + `access_token_key_id uuid`.
- Backfill: encrypt existing plaintext rows, then `access_token = NULL`.
- Rewrite `upsert_my_tracking_account` to encrypt on write.
- Rewrite `resolve_capi_config_for_resource` + add `read_my_capi_token_for_test` to decrypt only inside SECURITY DEFINER, returning plaintext to the server caller (never to the browser).
- Drop the raw `access_token` column at the end (kept during backfill for safety).

**b) `capi_fire_queue` retry table**
- Columns: `id, owner_id, pixel_id, scope, resource_id, event_name, event_id, payload jsonb, attempts int, next_attempt_at timestamptz, last_error text, status ('pending'|'sent'|'dead'), created_at`.
- Index on `(status, next_attempt_at)` for the worker.
- RPC `enqueue_capi_fire(...)` and `claim_capi_fires(_limit int)` for the worker (FOR UPDATE SKIP LOCKED).
- GRANTs: writes via service_role only; no anon/authenticated.

**c) Mark platform CAPI deprecated**
- Comment on `pixel_fire_log` describing the reconciled model (see §2).

## 2. Reconcile the two CAPI paths

**Decision: creator-CAPI (`/api/public/capi/fire`) is canonical for funnel/landing events.** Platform CAPI (`/api/public/pixel/track`) stays ONLY for platform-app events (signup, Purchase on billing, etc.) fired against the Nevorai pixel — never against creator pixels.

Code changes:
- `src/lib/pixel.ts`: when `pixelId` is set, NEVER mirror to platform `/track` (today it skips, but the comment is ambiguous — tighten the condition + add a guard log).
- `src/routes/api/public/pixel/track.ts`: reject requests that include a `pixel_id` field with 400 `wrong_endpoint`.
- Document the split at the top of both route files.

Result: every event has exactly one server fire, sharing `event_id` with the browser for Meta dedupe.

## 3. Retry queue worker

- New server route `src/routes/api/public/capi/drain.ts` (POST, secret-gated via `CAPI_DRAIN_SECRET`) — claims up to 50 pending rows, re-POSTs to Meta, marks sent/failed. Exponential backoff: 1m, 5m, 30m, 2h, 12h, then `dead`.
- Modify `capi/fire.ts`: on non-2xx or fetch error, `enqueue_capi_fire(...)` instead of swallowing.
- Provide a `pg_cron` snippet at the bottom of the migration to hit `/api/public/capi/drain` every minute (commented — user copies into Supabase Dashboard → Database → Cron).

## 4. /tracking verification panel

Upgrade the existing test-event card on `TrackingPage.tsx`:
- Show the last 5 fires from `pixel_fire_log` (filtered to the user) with: time, event_name, success/✗, `fbtrace_id`, latency.
- Show queue depth from `capi_fire_queue` (pending / dead counts).
- "Send test event" already exists — extend response panel to show `events_received`, `fbtrace_id`, `test_event_code` status, and a copy-to-clipboard button for the full Graph response.
- Add a "How to verify in Meta Events Manager" inline help (3 steps).

New server fn `getMyCapiDiagnostics` in `trackingAccount.functions.ts` returns `{ recent_fires, queue_pending, queue_dead, has_test_code }`.

## 5. Files I will touch

Create:
- `tracking_phase3_migration.sql`
- `src/routes/api/public/capi/drain.ts`

Edit:
- `src/lib/trackingAccount.functions.ts` — use new RPCs, add `getMyCapiDiagnostics`
- `src/routes/api/public/capi/fire.ts` — decrypt via RPC, enqueue on failure
- `src/routes/api/public/pixel/track.ts` — reject creator-pixel requests
- `src/lib/pixel.ts` — tighten platform-mirror guard
- `src/pages/TrackingPage.tsx` — verification panel

Secrets I'll request via `add_secret` after the migration: `CAPI_DRAIN_SECRET` (random, for the cron hitting `/api/public/capi/drain`).

## 6. What you do

1. Open Supabase SQL editor → paste `tracking_phase3_migration.sql` → run. It's idempotent so re-running is safe.
2. After I land the code, I'll prompt for `CAPI_DRAIN_SECRET` (random 32-char) and give you the one-line `pg_cron` snippet.
3. Paste a real Meta access token + `test_event_code` into `/tracking`, click Send test event, confirm `events_received: 1` in the panel and a hit in Meta Events Manager → Test Events.

Want me to execute this plan now?
