# Two improvements: scrollable editors + ON-by-default toggles

## Improvement 1 — Scrollable single-page editors

Replace the wizard (Next/Back, `wizardStep` state) in all three editors with one long scrollable page + scroll-spy sidebar.

### Shared infrastructure
Create `src/components/editor/EditorScrollLayout.tsx`:
- Props: `sections: { id, label, icon, num, complete? }[]`, `children`, `actions` (Save button slot)
- Desktop: sticky left sidebar (≥md) — section list with active highlight (left border + accent), check icon when `complete=true`. Click → `scrollIntoView({behavior:'smooth', block:'start'})`.
- Mobile (<md): sticky top chip bar (horizontal scroll) — same active highlight + tap-to-scroll.
- Active section detection: single `IntersectionObserver` (rootMargin `-30% 0px -60% 0px`, threshold 0) tracking `[id^="section-"]`.
- Sticky `Save` button slot top-right.

Each section block: `<section id="section-xxx" className="scroll-mt-20 space-y-4">…</section>`.

### FunnelEditor.tsx
- Remove `wizardStep`, `setWizardStep`, Next/Back buttons, mode-chosen gate UI.
- Keep both single/multi step lists conceptually, but render ALL sections stacked. Mode toggle stays as a control inside the "Name & Info" section.
- Sections rendered in order from `SINGLE_STEPS`/`MULTI_STEPS` (already defined). Conditionally swap the "Build Journey" block in multi-mode vs "Video" in single-mode.
- Sidebar derives from current mode array. `complete` = section's required field truthy (e.g. title set, video selected).

### LandingPageEditor.tsx & LivePage.tsx
Same treatment: identify the existing wizard step list, render all section bodies stacked, plug into `EditorScrollLayout`.

## Improvement 2 — ON-by-default toggles

### 2A. DB migration (funnels + landing_pages + live_sessions)
Inspect schema first via `security--get_table_schema`, then migration:
```sql
ALTER TABLE public.funnels
  ALTER COLUMN show_contact_buttons SET DEFAULT true,
  ALTER COLUMN whatsapp_auto_message SET DEFAULT true,
  ALTER COLUMN video_topics_enabled SET DEFAULT true,
  ALTER COLUMN allow_speed_change SET DEFAULT true;
-- speaker_mode already defaults to 'account' (ON)
-- Backfill NULLs to true for the same columns
```
Apply analogous defaults to `landing_pages` / `live_sessions` only for columns that actually exist there.

### 2B. Frontend defaults in `useState` initializers
`FunnelEditor` line 145–165 — flip:
- `show_contact_buttons: true`
- `whatsapp_auto_message: true`
- `video_topics_enabled: true`
- `allow_speed_change: true` (already true)
- `speaker_mode: "account"` (already on)

Mirror in LandingPageEditor / LivePage create-form initial state where equivalent fields exist.

## Out of scope (per "DO NOT TOUCH")
Auth, Razorpay, R2, public viewer routes, RLS, slug logic, anything else.

## Risk + verification
- Save/auto-save logic untouched — only presentation changes.
- Auto-save already runs on field change, no longer tied to step nav.
- Verify: create new funnel → all toggles ON, all sections visible, sidebar highlights on scroll, click jumps, mobile chips work, `bunx tsc --noEmit` clean.

## Effort estimate
Large — touching 3 large files + 1 new component + 1 migration. ~30–45 min of edits. I'll do it in this order: (1) scaffold `EditorScrollLayout`, (2) refactor FunnelEditor (biggest), (3) Landing, (4) Live, (5) DB migration, (6) defaults flip, (7) typecheck.
