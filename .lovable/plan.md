# Fix: Password reset emails never arrive

## Why this is happening

Every password-reset entry point in the app (`/forgot-password`, `/auth/reset-password`, and the old `src/pages/ResetPassword.tsx`) calls `supabase.auth.resetPasswordForEmail(...)`. That uses **Supabase's built-in email provider**, which on this project is hard-capped at ~2 emails per hour and is widely flagged as spam. Once that cap is hit, every subsequent request silently fails — the user sees "email sent", but Supabase never actually delivers it. This matches exactly what your prospect reported (no mail, not in spam either).

The signup/login flow itself is fine. The bug is only the reset email transport.

## The fix (uses what's already working)

We already have two working email transports in `src/routes/api/public/email/send.ts`:
- **Admin Gmail** (via `send-gmail-email` edge function) — already connected, OAuth working.
- **Resend** — used today for welcome, receipt, and reminder emails.

We will generate the Supabase recovery link **ourselves** on the server and send it through these transports instead of letting Supabase send it. The existing `/reset-password` page already knows how to consume the recovery token in the URL hash, so the click-through experience does not change.

## What changes

### 1. New server function: `requestPasswordReset` (`src/lib/auth.functions.ts`)
- Input: `{ email }`.
- Uses `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: '<site>/reset-password' } })` to mint a real Supabase recovery link.
- Calls the existing `/api/public/email/send` route with a new `password_reset` payload type.
- Always returns `{ ok: true }` — never reveals whether the email exists (prevents account enumeration). Errors are logged server-side only.

### 2. Extend `src/routes/api/public/email/send.ts`
- Add a new payload variant: `{ type: "password_reset"; to: string; name?: string; action_link: string }`.
- Build a clean branded "Reset your Nevorai password" HTML (same wrap/button style as the other system emails, 15-minute expiry note, "ignore if you didn't request this" line).
- Transport order: **Gmail first** (since the user explicitly wants to use the connected Gmail), **Resend fallback** if Gmail is not connected or fails. This mirrors how lead emails already work.

### 3. Rewire the three reset entry points
- `src/routes/forgot-password.tsx` — replace `supabase.auth.resetPasswordForEmail(...)` with `requestPasswordReset({ data: { email } })`.
- `src/routes/auth.reset-password.tsx` — same swap.
- `src/pages/ResetPassword.tsx` — same swap (kept for any stale links).

UI behaviour stays identical: enter email → loading → "Check your email" success state. No new screens, no flow change for users.

### 4. No changes needed to
- `/reset-password` route — already correctly reads `access_token` + `refresh_token` from the URL hash and calls `supabase.auth.updateUser({ password })`. The link we email has exactly that shape.
- Sign-up, login, profile, or any other auth flow.
- Database schema, RLS, or migrations.
- The Gmail OAuth setup — we use it exactly as it is.

## Safety / "nothing should break" checklist

- The `supabase.auth.admin.generateLink` API produces the same token format Supabase would have sent itself, so the existing reset page consumes it without changes.
- If Gmail token is revoked or rate-limited, we automatically fall back to Resend — the user still gets the mail.
- If both transports fail, the server function still returns `{ ok: true }` to the client (no enumeration), and the failure is logged for you in worker logs.
- No edits to login, signup, `useAuth`, session handling, or the protected route layout.
- No DB migrations, no env var changes (Gmail OAuth and `RESEND_API_KEY` are already configured).

## Manual verification after build

1. Open `/forgot-password`, submit your own email → check inbox (should arrive from your connected Gmail within seconds).
2. Click the link → land on `/reset-password` → set new password → redirected to `/auth` → log in with the new password.
3. Submit a non-existent email → UI still says "sent" (correct — no enumeration), worker logs show `user_not_found`.
