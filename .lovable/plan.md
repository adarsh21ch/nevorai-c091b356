# Build Plan — Pixel Health, Verifier & Nev AI Insights

Three connected upgrades on top of the Meta Pixel feature. Built in priority order so each one ships value on its own.

---

## 1. Pixel Health Dashboard

**Where:** New card at the top of Funnel Detail page and Landing Page Detail page. Plus a compact strip inside the editors next to the Pixel ID field.

**What the creator sees**
- Big status badge: 🟢 Healthy / 🟡 Partial / 🔴 Not firing / ⚪ Using fallback
- Which pixel is actually firing right now (this page → account default → platform)
- Last 24h: PageViews, Leads, success rate
- Last event timestamp ("2 minutes ago")
- 7-day sparkline of events
- Latest 5 events log (event, time, success)
- "Open in Meta Events Manager" deep link

**Data source:** We already log to `meta_pixel_events_log`. Add a small server function `getPixelHealth({ scope: 'funnel'|'landing', id })` that aggregates last 24h/7d for that page's resolved pixel ID. No new tables.

---

## 2. One-Click Pixel Verifier

**Where:** Button on the Health Dashboard + inside the editor next to the Pixel ID field: **"Test my pixel now"**.

**Flow (≤10 seconds, no extensions needed)**
1. Click → opens a hidden iframe of the public funnel/landing URL with a `?nev_pixel_test=1&run=<uuid>` flag.
2. The public page reads the flag and fires a `TestEvent` with that `run` id to the resolved pixel.
3. Backend listens for the matching event in `meta_pixel_events_log` (poll up to 15s).
4. Result modal in plain Hinglish/English:
   - ✓ "Working perfectly — events reaching pixel `123…`"
   - ✗ "Pixel ID looks wrong" / "Browser blocked it (likely ad-blocker)" / "Page didn't load — check publish status"
   - Specific fix suggestion for each failure.

---

## 3. Nev AI Insights Assistant

**Where:** New floating "Ask Nev AI" button on Funnel Detail, Landing Detail, and main Insights page. Opens a chat side-panel scoped to that resource (or "all my funnels" on the main page).

**Conversation shape:** Threads, persisted in DB (so creators can revisit past Q&A). One thread per funnel/landing + a global one.

**What it can do (all 4 capabilities you picked)**

| Capability | Example |
|---|---|
| **Answer data Qs** | "kitne leads aaye is week?", "best converting hour?", "kaunsa funnel sabse better hai?" |
| **Suggest improvements** | "Drop-off at 0:15 is 68% — shorten your intro", "Mobile conversion 3× lower than desktop — your form is too long" |
| **Take actions (with approval)** | "Rewrite my CTA to be punchier" → AI drafts → creator clicks **Apply** or **Discard**. Same for headline, description, lead form copy. |
| **WhatsApp summaries** | Toggle in Profile → "Daily summary" or "Weekly summary". Sent via existing WhatsApp pipeline at 9 AM IST. |

**How it works**
- TanStack server function `chatWithNevAI` using `streamText` from AI SDK + Lovable AI Gateway (`google/gemini-3-flash-preview`).
- Tools the AI can call: `getFunnelStats`, `getLeadsBreakdown`, `getVideoEngagement`, `getPixelHealth`, `getDropOffPoints`, `proposeContentEdit` (returns a draft, never writes), `applyContentEdit` (requires `needsApproval`).
- Conversation history stored in `nev_ai_threads` + `nev_ai_messages` tables (scoped to `auth.uid()` via RLS).
- Scheduled WhatsApp summary: pg_cron job → server route → fetches user's daily numbers → AI generates 3-line summary → posts to existing WhatsApp send endpoint.

**UI:** AI Elements (Conversation, Message, Composer) — markdown rendering, tool-call cards (e.g. "Read top 10 leads"), Apply/Discard buttons on action proposals.

---

## Ship Order
1. **Pixel Health Dashboard** (1 server fn + 1 card component, reuses existing log table) — fastest win
2. **Pixel Verifier** (small public-page listener + result modal)
3. **Nev AI Insights** — bigger; ships in two waves:
   - Wave A: chat + data Q&A + improvement suggestions
   - Wave B: approval-gated content edits + WhatsApp daily/weekly summaries

---

## Technical Notes
- New tables: `nev_ai_threads`, `nev_ai_messages` (RLS scoped to owner). Pixel Health reuses existing `meta_pixel_events_log`.
- WhatsApp summary opt-in lives on `profiles` (`ai_summary_frequency`: `off|daily|weekly`).
- All AI calls server-side via Lovable AI Gateway; no keys in browser. Errors (429/402) surfaced with clear messages.
- Mobile-first cards, semantic tokens only, matches your existing glass-card style.
- Quotas: AI usage tracked in existing `nev_ai_usage` table — gated per plan (free/basic limited, pro unlimited).

Reply **"go"** to start with Pixel Health Dashboard, or tell me to reorder.
