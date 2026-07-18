
# Funnel OS — Individual + Leader Tiers (Phased Plan)

Goal: turn a Leader-plan subscription into the trigger that upgrades the user's existing workspace to a branded, team-enabled space. Individual plan stays unchanged. Reuse `workspaces`, `workspace_members`, `workspace_branding`, `workspace_invitations`, and the host-based tenant resolver. No parallel systems.

---

## Phase 0 — Foundation Fix: workspace_members RLS recursion

**Why first:** every Leader feature (owner dashboard rollup, invites, rep list, branding scope) reads `workspace_members`. The recursion bug will silently break them.

**Does:**
- Reproduce the recursion path (likely a policy on `workspace_members` that SELECTs from `workspace_members`, or `same_workspace_as()` calling a function that re-enters the table).
- Move all "is caller a member/owner of workspace X" checks into `SECURITY DEFINER` helpers (`is_workspace_member(uuid)`, `is_workspace_owner(uuid)`, `workspace_role(uuid)`) that bypass RLS internally.
- Rewrite `workspace_members` policies to use those helpers + direct `auth.uid()` comparisons only — never a subquery back into `workspace_members`.
- Re-audit `same_workspace_as()` and the 16 tables touched in the recent security migrations to make sure none of them reintroduce recursion.

**Touches (existing):** `phase0_workspaces_foundation.sql`, `phase2_notnull_and_helpers.sql`, `phaseR_repair.sql`, `phase_sec_*` files (reference only), `src/hooks/useWorkspaces.ts`, `src/hooks/useActiveWorkspace.ts`, `src/hooks/useWorkspaceMembers.ts`.

**New:** one migration `phase7_fix_workspace_members_recursion.sql` + rollback.

**Safety:** pure policy/function rewrite, no data change. Verify with impersonated `SELECT` tests before/after.

---

## Phase 1 — Backend Cleanup & Migration Hygiene

**Why here:** we're about to add plan↔workspace glue, billing hooks, and integration settings tables. Doing that on top of ~60 loose root-level `.sql` files and dead code will compound the mess.

**Does:**
- Inventory every `*.sql` at repo root, classify each as: (a) already-applied historical → move to `supabase/migrations/` with proper timestamp prefix, (b) superseded/obsolete → archive under `supabase/migrations/_archive/`, (c) never applied / experimental → confirm with user then delete.
- Inventory `supabase/functions/*` and `src/lib/*.functions.ts` for endpoints with zero call sites (grep-verified) → list for removal.
- Inventory `src/pages`, `src/hooks`, `src/components` for orphans (no import references) → list for removal.
- Delete the confirmed-dead `Enterprise` remnants, unused `useVideoGate`, and any leftover `nflow` string references not preserved for compatibility.
- Consolidate the 3–4 near-duplicate plan/pricing hooks (`usePlan`, `usePlans`, `usePlanPricing`, `usePlanLimits`) into a documented layering (data hook vs. limits hook vs. display hook) — no behaviour change, just kill duplication.

**Touches:** root `*.sql`, `supabase/functions/`, `src/hooks`, `src/pages`, `src/lib`.

**New:** `supabase/migrations/_archive/` folder, `docs/BACKEND_MAP.md` (one-page map of what lives where after cleanup).

**Safety:** every deletion is preceded by a grep report shared with you. Nothing removed without your sign-off in this phase.

---

## Phase 2 — Plan ↔ Workspace Contract

**Why:** today `subscription_plans` and `workspaces` don't know about each other. Leader features need a single, cheap-to-check "is this workspace on the Leader plan right now?" answer.

**Does:**
- Add `workspaces.plan_slug` (text, default `'individual'`) and `workspaces.plan_seat_limit` (int, nullable). Backfill: every existing workspace → `'individual'`. The ~6 paying subs stay untouched because their user still owns their personal workspace.
- Add `subscription_plans.workspace_kind` enum (`individual` | `leader`) — declares which plan turns a workspace into a team workspace.
- Add SECURITY DEFINER helper `workspace_plan(uuid)` returning `(plan_slug, seat_limit, is_active)` for use in RLS and UI.
- Update `useActiveWorkspace` / `usePlan` to expose `workspace.plan_slug` alongside the user's subscription — a single source of truth for "am I looking at a Leader workspace right now?".

**Touches:** `workspaces` table, `subscription_plans` table, `src/hooks/useActiveWorkspace.ts`, `src/hooks/usePlan.tsx`, `src/contexts/TenantProvider.tsx`.

**New:** `phase8_workspace_plan_link.sql` + rollback.

**Safety:** all columns nullable/defaulted; existing queries keep working. No behaviour change until Phase 3 reads these fields.

---

## Phase 3 — Leader Subscription → Workspace Promotion

**Why:** the core mechanism the whole product hinges on.

**Does:**
- Extend `razorpay-webhook` (existing file, not new) so that on a successful Leader-plan payment for user X: locate X's owned workspace → set `plan_slug='leader'`, `plan_seat_limit=<from plan>`, ensure `workspace_branding` row exists. On downgrade/cancel/expiry: flip back to `'individual'`, keep the data, disable invite endpoints via plan check (do not delete reps — they just lose write access gracefully).
- Same logic mirrored in `razorpay-portal` for admin-forced grants and in the admin "override plan" UI so the two paths cannot drift.
- Add a `workspace_plan_events` audit table (small — id, workspace_id, from_plan, to_plan, reason, actor, ts) so we can debug promotions/demotions later.

**Touches:** `supabase/functions/razorpay-webhook/`, `supabase/functions/razorpay-portal/`, `src/pages/AdminSubscriptionsPage.tsx`.

**New:** `phase9_workspace_plan_events.sql`.

**Safety:** individual users never hit this path. Idempotent on repeated webhook delivery (keyed by razorpay event id).

---

## Phase 4 — Leader Owner Dashboard & Rep Management (UI, reusing existing tables)

**Why:** the visible Leader value.

**Does:**
- New route `/team` (Leader-only, gated by `workspace.plan_slug === 'leader'`) with three tabs: **Overview** (workspace-wide KPIs — views, leads, top funnels rolled up across all members), **Reps** (list from `workspace_members`, invite via existing `workspace_invitations`, remove, role change), **Branding** (edit `workspace_branding`: logo, colour, subdomain).
- Rep-side: when a rep logs in and their `active_workspace_id` is a Leader workspace, header shows Leader branding; their existing funnel/leads pages already scope by `workspace_id` so no data-layer change needed.
- Reuse existing `useWorkspaceMembers`, `useWorkspaceBranding`, `useWorkspaceSettings`. Only new hook: `useTeamRollup(workspace_id)` — one aggregate RPC that returns rollup counts (kept as one SECURITY DEFINER RPC to avoid N+1 and RLS gymnastics).

**Touches:** `src/routes/team.tsx` (fill in), `src/pages/MyTeamPage.tsx` (rework or replace with new `TeamOverviewPage`), `src/components/WorkspaceSwitcher.tsx`, `src/hooks/useWorkspaceMembers.ts`, `src/hooks/useWorkspaceBranding.ts`.

**New:** `useTeamRollup` hook, `team_rollup_rpc.sql` migration, `TeamOverviewPage`, `TeamRepsPage`, `TeamBrandingPage` components.

**Safety:** every new page gates on plan check; nothing renders for Individual users. Existing `DownlinePage` is superseded — mark deprecated in this phase, delete in a later cleanup pass once no route points at it.

---

## Phase 5 — Integration Scaffolding (Structure-First, Disabled By Default)

**Why:** you want WhatsApp + payments plumbing ready without touching live keys.

**Does:**
- One shared table pattern: `workspace_integrations (workspace_id, provider, enabled bool default false, config jsonb, secret_ref text, updated_at)` — one row per (workspace, provider). Providers seeded: `whatsapp_cloud`, `razorpay_workspace`, room for more.
- Admin UI in `/team` → Integrations tab: for each provider, show status (Disabled / Configured / Live), fields to paste keys later, a single "Enable" toggle. Toggle stays false until the user flips it.
- All existing WhatsApp/Razorpay code paths add a guard: `if (!integration.enabled) return { skipped: true }`. Existing global keys (the ones already working for the platform) are left completely alone — this scaffolding is per-workspace and additive.
- Secrets stored via `add_secret` per workspace-provider (`WORKSPACE_<id>_WHATSAPP_TOKEN` etc.), never in the `config` jsonb.

**Touches:** none of the currently-live integration files' behaviour — only add the guard branch.

**New:** `phase10_workspace_integrations.sql`, `src/components/team/IntegrationsPanel.tsx`, `useWorkspaceIntegrations` hook.

**Safety:** default false + guard-first means zero risk of accidental sends/charges.

---

## Phase 6 — QA, Docs, Rollout

**Does:**
- End-to-end test matrix: (a) new Individual signup → normal experience, (b) existing paying user → nothing changes, (c) new Leader signup → workspace promoted, branding editable, invite flow works, rep sees Leader branding, rollup shows their data, (d) Leader cancels → demoted cleanly, reps' data preserved, invite endpoints disabled.
- Update `docs/BACKEND_MAP.md` and `CLAUDE.md` "Ongoing" section with the final architecture.
- Publish.

---

## Ordering rationale

RLS fix (0) → cleanup (1) → data contract (2) → mechanism (3) → UI (4) → integrations scaffold (5) → verify (6). Each phase is independently reversible and ships without breaking the ~6 existing paying users or any current Individual user.

Ready for your review — tell me what to adjust and I'll re-issue the plan before we start Phase 0.
