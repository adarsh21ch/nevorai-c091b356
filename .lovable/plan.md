## WhatsApp Automation System — Build Plan

### 1. Database (one migration)

Create 5 tables exactly as specified:
- `whatsapp_templates` (with FK note: `media_key` is a soft reference to `whatsapp_media.key`, no FK constraint since media table uses `key` text not necessarily unique-FK ready — I'll verify and add FK if safe)
- `whatsapp_automations`
- `whatsapp_automation_steps` (cascade delete on automation)
- `whatsapp_sequence_enrollments` (unique `(phone_number, automation_id)`, index on `next_send_at` + `status` for scheduler)
- `whatsapp_campaigns`

RLS: enable on all 5; admin-only policies using existing `has_role(auth.uid(), 'admin')` pattern (will check project's existing admin check helper first).

Seeds (in migration):
- 6 templates (exact bodies as provided)
- 2 automations (`Funnel Lead Nurture`, `Post-Subscription Onboarding`) both inactive
- Steps wired to template IDs via CTE/subquery by name

### 2. UI — new components

Create:
- `src/components/admin/WhatsAppTemplatesTab.tsx` — list table + Sheet editor with variable chips, live phone-bubble preview, media dropdown
- `src/components/admin/WhatsAppAutomationsTab.tsx` — card list + Sheet editor + inline steps builder (add/delete/reorder; reorder via up/down arrows to keep scope tight — drag-and-drop deferred unless you want it)
- `src/components/admin/WhatsAppCampaignsTab.tsx` — table + Sheet creator with segment audience count (queries `profiles` + `subscriptions`), schedule/send-now, preview
- `src/components/admin/whatsapp/TemplatePreview.tsx` — shared phone-bubble preview with variable substitution
- `src/components/admin/whatsapp/variables.ts` — variable list + render helper

### 3. Wire into AdminWhatsAppPage

Update `src/pages/AdminWhatsAppPage.tsx` tab order to:
`Conversations | Leads | Automations | Campaigns | Templates | Media | Help Articles`

Remove the old "Templates" tab (the template-name-per-automation mapping). The new system replaces it. Credentials/Automations(old toggles)/Logs tabs — Logs stays, old Automations toggles tab and old Templates mapping tab are removed since the new Automations/Templates tabs supersede them. **Confirm this** — see Question below.

### 4. Data layer

- React Query for all reads; mutations invalidate relevant keys.
- 300ms debounce on search inputs (template picker, campaign template search).
- Optimistic updates on Active toggles + sonner toast on success/error.
- Loading skeletons + empty states with CTA.

### 5. Backend execution (scheduler) — out of scope for this turn

This build covers **schema + admin UI + seeds**. The actual sequence runner (cron job that reads `whatsapp_sequence_enrollments` where `next_send_at <= now()` and `status='active'`, sends via WhatsApp API, advances `current_step`/`next_send_at`, and the trigger hooks that enroll users on `funnel_lead_captured` / `subscribed` / trial-day events) is a **separate deploy** — a Supabase cron + extension to `whatsapp-webhook` / new `whatsapp-sequence-runner` edge function. **Confirm** you want me to do UI + DB now, and runner in a follow-up turn (keeps this turn shippable + testable without runtime risk).

### Open questions

1. **Old tabs**: Remove the old "Templates" (per-automation template name mapping) and old "Automations" (on/off toggles list) tabs? They're superseded by the new system. Or keep both for backward compat with existing automations in `whatsapp_settings.templates`/`automations_enabled`?
2. **Runner**: Confirm runner/triggers come in a follow-up turn after you verify the UI + schema work.

If answers are "yes remove old tabs" and "yes runner later" — I'll execute immediately on approval.

### Technical notes
- Migration file: `whatsapp_automation_system_migration.sql` at repo root (matches existing convention).
- Type regen: types under `src/integrations/supabase/types.ts` are auto-managed; I'll cast via `as any` on table names if types lag, matching the existing `WhatsAppHelpArticlesTab` pattern.
- Audience counts query `profiles` joined with `subscriptions` — I'll verify exact column names before writing the queries.
