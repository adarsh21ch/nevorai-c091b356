## Goal
Make the **Send test event** button in admin → Settings → Meta Pixel actually call the Meta Conversions API and log a real success/failure, instead of always throwing the hardcoded "403 / use Meta Events Manager" error.

## Root cause
`supabase/functions/meta-pixel-fire/index.ts` only accepts requests where the `Authorization` bearer equals `SUPABASE_SERVICE_ROLE_KEY`. The browser sends the admin user's JWT, so it always 403s and the frontend translates that into the "must be triggered server-side" message. CORS is fine.

## Fix (one file, then redeploy)
Edit `supabase/functions/meta-pixel-fire/index.ts` to allow **two** auth paths:

1. **Service-role bearer** (existing) — used by other edge functions / server-to-server callers. Keep behavior unchanged.
2. **Admin user bearer** (new) — used by the admin UI test button:
   - Take the JWT from `Authorization: Bearer <jwt>`.
   - Create a Supabase client with the service-role key, call `auth.getUser(jwt)` to verify the token and get `user.id`.
   - Call the existing `public.has_role(user.id, 'admin')` RPC.
   - If admin → continue into the existing Graph API send path. If not → 403.

Everything else (Graph API call, `meta_pixel_events_log` insert, response shape) stays as-is, so the recent-events list will show the real result.

## Frontend cleanup
In `src/components/admin/settings/MetaPixelTab.tsx`:
- Remove the special-cased `if (res.status === 403)` branch that throws the misleading "use Meta Events Manager" message.
- On non-OK response, show the actual error from the JSON body (e.g. Meta's `error.message`) via `toast.error`.
- On success, keep "Test event queued" and invalidate the logs query (already there).

## Deploy steps
1. Edit the edge function.
2. `supabase functions deploy meta-pixel-fire`
3. In admin → Settings → Meta Pixel → set **Active** on, save Pixel ID + Access Token, optionally set a Test Event Code, click **Send test event**.
4. Expected: toast "Test event queued", and a new ✅ row appears in **Recent events** within ~10s. In Meta Events Manager → Test Events tab (if `test_event_code` is set) the `TestEvent` shows up.

## Out of scope
- No DB migration. `has_role` already exists per project conventions.
- No changes to how real funnel events fire (those still use service-role from other edge functions).
- No CORS changes — function already has correct CORS headers.
