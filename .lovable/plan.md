# Fix: WhatsApp OTP not delivering

## Root cause (most likely)

`whatsapp-send-otp/index.ts` sends OTP as a free-form **text** message:

```ts
type: "text",
text: { body: message }
```

Meta's WhatsApp Cloud API **only allows free-form text inside an open 24-hour customer-service window** (i.e. the user has messaged your business in the last 24 hours). For a new signup, that window is closed, so Meta rejects the send with error code `131047` ("Re-engagement message" / outside 24h window) or `131026` ("Message undeliverable"). Our function returns `502 send_failed`, the client shows the generic "Could not send, try again", and **no WhatsApp ever reaches the user**.

Additionally:
- The OTP row is **inserted before** the Meta call. When Meta fails, the row stays. The next attempt within 60 seconds then hits our own `rate_limit` (429) and again shows "Could not send" — so the resend button also looks broken.
- The client toast (`VerifyWhatsAppPage` / `WhatsAppVerification`) collapses every backend error into a generic message, hiding the real Meta error from the user and from us.
- `lookup-email-by-phone` is not registered in `supabase/config.toml`, so "Login with phone" would also fail once OTP works again.

## Fix plan

### 1. Send OTP via an approved Authentication template (the real fix)

Change `supabase/functions/whatsapp-send-otp/index.ts` to send a **template** message in the `authentication` category. Templates are allowed to initiate conversations and are the only Meta-approved way to deliver OTPs.

```ts
body: JSON.stringify({
  messaging_product: "whatsapp",
  to: phone,
  type: "template",
  template: {
    name: settings.otp_template_name,        // e.g. "nevorai_otp"
    language: { code: settings.otp_template_lang || "en" },
    components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0",
        parameters: [{ type: "text", text: code }] },
    ],
  },
}),
```

Add two columns to `whatsapp_settings` (migration):
- `otp_template_name TEXT` (default `'nevorai_otp'`)
- `otp_template_lang TEXT` (default `'en'`)

**User action required (cannot be automated):** an authentication template named `nevorai_otp` must exist and be **Approved** in Meta Business Manager → WhatsApp Manager → Message Templates. Body: `Your verification code is {{1}}. For your security, do not share this code.` with a copy-code button using `{{1}}`. I'll surface a clear error in admin if Meta returns "template not found".

### 2. Don't poison the rate-limit window on failure

Reorder the function so the OTP row is **inserted only after** Meta confirms `messages[0].id`. If Meta fails, no row is written, so the user can retry immediately instead of getting blocked for 60 s by our own rate limiter.

### 3. Surface real errors to the user and to logs

- `console.error(...)` the Meta error code + message + `phone` (masked).
- Return structured `{ error, message, meta_code }` and have `VerifyWhatsAppPage` show `data.message` instead of the generic toast.
- Specifically map: `131047 / 131026 / template_not_found / token_expired / phone_id_invalid` → user-friendly messages.

### 4. Register missing function

Add to `supabase/config.toml`:
```toml
[functions.lookup-email-by-phone]
verify_jwt = false
```
so the existing "Login with phone" path works once OTP delivery is fixed.

### 5. Quick verification path

After deploy, I'll call `whatsapp-send-otp` directly with a test phone via `invoke-server-function`-style curl, then read `server-function-logs` for the Meta response code to confirm template send succeeds. If Meta still rejects, the log will tell us exactly which of (token / phone_number_id / template approval) is wrong — we'll know within one round-trip instead of guessing.

## Files touched

- `supabase/functions/whatsapp-send-otp/index.ts` — template send, reordered insert, real error surfacing
- `supabase/config.toml` — register `lookup-email-by-phone`
- `whatsapp_otp_template_migration.sql` (new) — adds `otp_template_name`, `otp_template_lang` to `whatsapp_settings`
- `src/pages/VerifyWhatsAppPage.tsx` — show server-provided `message` in toast
- `src/components/profile/WhatsAppVerification.tsx` — same toast fix

## What I need from you

1. Confirm you (or I, via guidance) will create/approve the **`nevorai_otp` authentication template** in Meta WhatsApp Manager — this is a Meta-side approval and usually takes a few minutes. Without it, no fix on our side will make OTPs deliver.
2. Confirm the WhatsApp access token in `whatsapp_settings` is a **System User permanent token**, not a temporary 24-hour debug token (temporary tokens silently expire and cause the same symptom). If unsure, I'll add a one-shot diagnostic call to `/v20.0/me` that prints token validity in logs.
