## Goal
Before you announce "enter your Meta Pixel ID and track your business", make sure that for a creator who sets a pixel — either at Account (Profile) level or per Funnel/Landing Page — every event Meta needs actually fires to **their** pixel, the health dashboard reflects it, and the verifier confirms it.

## What I found while auditing

1. **Funnel public page** (`PublicFunnel.tsx`) — ✅ OK.
   The `get-funnel-data` edge function already returns `funnel.meta_pixel_id` AND `creator.meta_pixel_id`. Resolution order `funnel → account → platform` works. PageView, ViewContent, and Lead all fire to the right pixel.

2. **Landing public page** (`PublicLandingPage.tsx`) — ⚠️ **Broken account-level fallback.**
   Code path:
   ```ts
   let effective = data.meta_pixel_id;
   if (!effective) {
     const { data: rpcData } = await supabase.rpc("get_profile_meta_pixel_id", { _owner_id: data.owner_id });
   }
   ```
   The RPC **`get_profile_meta_pixel_id` does not exist in any migration on disk.** Result: a creator who set their pixel once on the Profile page (the "account default" we tell them about in `MetaPixelIdField`) gets silently downgraded to the platform pixel on every landing page. Their PageView/Lead never reach their Meta Events Manager — they will (rightfully) call this broken.

3. **`pixel_fire_log` telemetry table** — ⚠️ Migration file `pixel_fire_log_migration.sql` exists in the repo but is a manual SQL the user has to run. If it hasn't been run, the Health Dashboard is empty and the One-Click Verifier will always say "Not detected" even when the pixel actually fired. Need to confirm.

4. **`profiles.meta_pixel_id` column** — referenced everywhere (Profile, Editors, edge function, public pages) but I cannot locate the migration that adds it. Likely added in-session via the migration tool; needs a live DB check before announcement.

5. **CAPI server-side mirror** — by design, `/api/public/pixel/track` only mirrors when the platform pixel is used (creator pixels have no access token configured). This is correct, but means creator-pixel events are browser-only and will be lost to ad-blockers. Worth telling creators in the help text; not a blocker.

6. **Lead event** on landing page — fires after submission with `effective` pixel, so once #2 is fixed, it inherits the fix.

## Plan of action

### A. Fix the account-pixel fallback on landing pages (the only real bug)

Two options — I'll go with **Option 1** because it removes a moving part and matches how funnels already do it:

**Option 1 (recommended): resolve owner pixel via a tiny safe view, no RPC.**
- Add a SECURITY DEFINER SQL function `public.get_profile_meta_pixel_id(_owner_id uuid) returns text` (idempotent `create or replace`) that returns ONLY `meta_pixel_id` from `profiles` for the given owner. No PII. Grant EXECUTE to `anon, authenticated`. This matches the call site already in the code, so no client edit needed.
- Migration file: `landing_owner_pixel_rpc_migration.sql`.

**Option 2 (alt): denormalize `owner_pixel_id` into `landing_pages` and keep it in sync with a trigger.** More moving parts; skipped unless you prefer it.

### B. Verify required DB objects are live

Run a quick check (read-only SQL via the migration tool) on the live DB to confirm:
- `profiles.meta_pixel_id` column exists.
- `landing_pages.meta_pixel_id` column exists.
- `funnels.meta_pixel_id` column exists.
- `pixel_fire_log` table exists with the policies from `pixel_fire_log_migration.sql`.

If any are missing, ship the appropriate migration in the same wave.

### C. End-to-end runtime verification with Playwright

For each surface, against the live preview:
1. Open a published landing page with `?nev_pixel_test_run=<uuid>` in URL.
2. Read browser console — confirm `[pixel] firing via creator pixel <id> PageView eventID …`.
3. Poll `pixel_fire_log` via the existing `/api/public/pixel/fire-log` write + the `checkPixelTestRun` server fn — confirm rows land with `scope=landing`, correct `pixel_id`, `success=true`.
4. Submit the lead form, confirm `Lead` event also fires to creator pixel.
5. Repeat for a funnel public URL.
6. Confirm the Pixel Health card on the dashboard then shows the fresh events, status badge flips to "Healthy", sparkline updates.

### D. Help-text polish (small UX, no logic)

Add one line to the `MetaPixelIdField` help disclosure: "Events from your pixel are sent from the visitor's browser. If a visitor uses an ad-blocker, that single event may be missed — Meta's own pixel has the same limitation."

### E. Re-test verifier flow

Run the "Test now" button on one funnel and one landing page after A+B, confirm it returns ✅ within the polling window.

## Out of scope for this turn
- Per-creator CAPI access tokens (would solve ad-blocker loss but needs Meta app + token storage — separate feature).
- Custom events beyond PageView / ViewContent / Lead.

## Files I expect to touch (build mode)
- `landing_owner_pixel_rpc_migration.sql` — new migration (if needed, also add any missing column / `pixel_fire_log`).
- `src/components/pixel/MetaPixelIdField.tsx` — one-line help text addition.
- No other code changes anticipated; the rest is verification.

## Deliverable
A short go/no-go report you can copy into your announcement: which surfaces fire to creator pixels, which events, what the verifier confirms, and the one ad-blocker caveat to mention.

Reply **approve** to switch to build mode and execute.