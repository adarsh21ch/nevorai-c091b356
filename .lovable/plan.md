## Add international phone number support

### Approach
Introduce a reusable `NPhoneInput` component wrapping `react-phone-number-input`, styled to match the dark theme via Tailwind/CSS overrides. Replace every hard-coded `+91 [10 digit]` phone input across signup, OTP verify, profile, landing-page lead capture, funnel member registration, admin lead/conversation tools, and live/funnel public forms. Output stays in E.164 (`+919876543210`). Existing 10-digit DB values keep working — display falls back to raw value, and validation uses `isValidPhoneNumber`.

### Steps

1. **Install dependency**
   - `bun add react-phone-number-input`

2. **Create reusable component** `src/components/ui/PhoneInput.tsx`
   - Wraps the library, `international` + `defaultCountry="IN"` + `countryCallingCodeEditable={false}`
   - Exports `NPhoneInput` and re-exports `isValidPhoneNumber` for convenience
   - Imports library stylesheet once

3. **Theme overrides** in `src/styles.css`
   - Style `.PhoneInput`, `.PhoneInputInput`, `.PhoneInputCountry`, `.PhoneInputCountrySelect`, `.PhoneInputCountryIcon`, dropdown menu — match existing `Input` (bg-muted, border-border, rounded-md, focus ring, dark-mode aware)

4. **Update `src/lib/leadInputs.ts`**
   - Add `validateInternationalPhone(v)` using `isValidPhoneNumber`; keep existing `validatePhone` for legacy 10-digit IN forms still in use (so nothing breaks)
   - Add `normalizeE164(v)` passthrough helper

5. **Replace inputs in user-facing forms** (use `NPhoneInput`, store/submit E.164):
   - `src/pages/VerifyWhatsAppPage.tsx` — phone step + cooldown logic; send full E.164 to `whatsapp-send-otp`
   - `src/components/profile/WhatsAppVerification.tsx` — settings inline verify
   - `src/components/auth/AuthPage.tsx` — signup phone field (if present)
   - `src/pages/Onboarding.tsx` — if it collects phone
   - Funnel/landing lead capture forms (search & swap):
     - `src/components/funnel/**` member registration / lead form
     - `src/components/landing/**` lead capture form
     - `src/pages/PublicLandingPage.tsx`, `PublicFunnel.tsx`, `PublicLivePage.tsx` forms
   - Admin tools:
     - `src/components/admin/WhatsAppLeadsTab.tsx` (Add Lead)
     - `src/components/admin/whatsapp/ConversationsTab.tsx` phone search/add
   - `src/pages/WhatsAppTestPage.tsx`

6. **Submit-time normalization**
   - For each form, strip the `+` only if the backend specifically requires raw digits; otherwise pass E.164 through. Default: send E.164.
   - For OTP flows that previously sent 10-digit local: send E.164 — backend already accepts arbitrary digit strings; `whatsapp-send-otp` is the main consumer and treats `phone_number` as a string.

7. **Display fallback**
   - When a stored value lacks `+` (legacy 10-digit IN), prefix `+91` for display in `NPhoneInput`'s `value`.

8. **Validation**
   - Use `isValidPhoneNumber` to gate submit buttons + show inline "Please enter a valid phone number" error.

### What stays the same
- DB schema / column types
- All backend edge functions
- Existing 60s OTP cooldown, attempt lockout, RLS, etc.
- Non-phone form behaviour

### Out of scope
- Data migration of historical rows
- Changing how the OTP template renders the number
- Any UI rework beyond the phone field itself

### Risk notes
- Library ships its own CSS — overrides scoped via class selectors in `styles.css` so it inherits theme tokens
- A few forms may have custom masks (e.g., `maxLength={10}`) that we replace entirely with the component
- Will grep for `type="tel"`, `+91`, `whatsapp_number`, `phone_number` to ensure full coverage before finishing
