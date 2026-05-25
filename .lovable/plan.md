## What you need to do

Just **one step**: run the SQL migration in Supabase. **No edge function** needs to be created right now — the UI uses the Supabase JS client directly for all CRUD (templates, automations, campaigns).

The scheduler/runner (cron that actually sends scheduled WhatsApp messages from `whatsapp_sequence_enrollments` + `whatsapp_campaigns`) is a **separate follow-up task** — not part of this turn.

---

### Step 1 — Run the SQL

**File in your repo:** `supabase/migrations/20260525030000_whatsapp_automation_system.sql` (220 lines, already created)

**Two ways to apply it:**

**Option A — Supabase SQL Editor (copy-paste)**
1. Open Supabase Dashboard → SQL Editor → New query
2. Open the file `supabase/migrations/20260525030000_whatsapp_automation_system.sql` in your editor
3. Copy the entire contents, paste into SQL Editor, click **Run**
4. It's idempotent (`create table if not exists`, `drop policy if exists`) so safe to re-run

**Option B — Supabase CLI (recommended, keeps migrations tracked)**
```bash
supabase db push
```
This applies all pending migrations from `supabase/migrations/` to your linked project.

---

### Step 2 — Edge functions

**None needed right now.** The new tabs (Templates, Automations, Campaigns) read/write directly via `supabase.from('whatsapp_templates')…` etc. from the admin UI.

When you're ready to actually **send** scheduled messages and run sequences, we'll add **one** new edge function:
- `supabase/functions/whatsapp-sequence-runner/index.ts` — cron-triggered, reads due enrollments + campaigns, calls existing `whatsapp-send-text`, advances state.

I'll generate that file (and the pg_cron schedule SQL) in a follow-up turn after you confirm the UI + tables look right.

---

### What the migration creates

5 tables, all with RLS (admins-only via your existing `has_role(auth.uid(),'admin')` function):
- `whatsapp_templates` — message templates with `{{variables}}`
- `whatsapp_automations` — sequence definitions (e.g. "Funnel Lead Nurture")
- `whatsapp_automation_steps` — ordered steps per automation (delay_hours, template_id, stop_if_subscribed)
- `whatsapp_sequence_enrollments` — per-phone progress (current_step, next_send_at, status)
- `whatsapp_campaigns` — one-off broadcasts to a segment

Plus seed data: 6 default templates and 2 automations (both inactive until you enable them).

---

### Summary

| What | Where | Action |
|---|---|---|
| SQL migration | `supabase/migrations/20260525030000_whatsapp_automation_system.sql` | Run in Supabase SQL Editor or `supabase db push` |
| Edge function | none | Skip for now |
| Scheduler/runner | follow-up turn | After you confirm UI works |
