# Fix: WhatsApp OTP not delivering (template button mismatch)

## Root cause (confirmed)

Direct test of `whatsapp-send-otp` returns HTTP 200 + `wamid` from Meta, but users never receive the OTP. The `nevorai_otp` template is configured in Meta with a **Copy Code** button, but our code sends the button as a URL button:

```ts
// supabase/functions/whatsapp-send-otp/index.ts  (current — WRONG)
{ type: "button", sub_type: "url", index: "0",
  parameters: [{ type: "text", text: code }] }
```

Meta's Cloud API accepts the request (returns a wamid) but silently fails to render/deliver the message because the button payload shape doesn't match the approved template. No webhook `delivered` event ever fires, so the user sees nothing.

This is why:
- Backend logs look healthy (no Meta error code).
- Resend button shows "could not send" — actually our 60s cooldown kicking in after the silently-failed first send.
- It affects every signup user, not just one.

## The fix (one file)

Change the button block in `supabase/functions/whatsapp-send-otp/index.ts` to Meta's required shape for **Copy Code** buttons in Authentication templates:

```ts
{
  type: "button",
  sub_type: "copy_code",
  index: "0",
  parameters: [{ type: "coupon_code", coupon_code: code }],
}
```

The body block stays as-is (one text param with the code) — Authentication templates with copy-code buttons still require the code in the body parameter.

Full template send block after fix:

```ts
template: {
  name: templateName,                         // "nevorai_otp"
  language: { code: templateLang },           // "en"
  components: [
    { type: "body", parameters: [{ type: "text", text: code }] },
    { type: "button", sub_type: "copy_code", index: "0",
      parameters: [{ type: "coupon_code", coupon_code: code }] },
  ],
},
```

No other code changes. The fallback-to-text branch, error mapping, rate-limit reordering, client toasts, and 60s cooldown all stay exactly as they are.

## Verification (after deploy)

1. Call `whatsapp-send-otp` with a real test phone via `invoke-server-function`.
2. Confirm the phone actually receives the WhatsApp message with the 6-digit code and a "Copy code" button.
3. If it still doesn't arrive, the next thing to check is the webhook `statuses` payload — but with the button payload corrected, Meta should deliver normally.

## Files touched

- `supabase/functions/whatsapp-send-otp/index.ts` — change button `sub_type` from `"url"` to `"copy_code"` and parameter from `{ type: "text", text: code }` to `{ type: "coupon_code", coupon_code: code }`.

## What I do NOT need from you

No Meta dashboard changes, no template re-approval, no migration. The template is already correct; only our API call to Meta is wrong.
