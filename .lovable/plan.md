
# NevorAI White-Label Multi-Tenant Refactor — Master Plan

## Decisions Locked In (from your answers + written rules)

| Decision | Choice |
|---|---|
| Tenancy scope | Every user lives in a workspace from day 1 (full SaaS isolation) |
| Workspace vs team | Workspace sits **above** teams (1 workspace → many teams → many users) |
| Session scope | Subdomain-isolated Supabase sessions |
| Wildcard hosting | Cloudflare Worker proxy in front of `nevorai.lovable.app` |
| Tenant resolver | `Host` header → `workspaces.slug` lookup (cached) |
| Reserved subdomain | `nevorai.com` / `flow.nevorai.com` / `www` → "marketing/legacy" workspace |

## Non-Negotiable Invariants (carried through every phase)

1. Every existing module (Auth, CRM, Calling, Follow-ups, Landing Pages, Funnels, Videos, Live, Tracking, Analytics, Dashboard, Notifications, AI, Admin) keeps working at the end of each phase.
2. Every migration is reversible. Every new column is `nullable` in the migration that adds it; flipped to `NOT NULL` only in a later migration once backfill is verified.
3. RLS is never weakened. A policy can only be replaced by an equal-or-stricter one, in the same migration, behind a feature flag.
4. No phase merges until: build green, RLS smoke tests pass, manual spot-check on 5 existing flows.
5. One codebase, one deployment, one Supabase project.

## Phases (each phase = one delivery + one stop-and-verify cycle)

### Phase 0 — Foundation (no behaviour change) ← START HERE

Goal: introduce the `workspaces` concept in the DB and a `TenantProvider` in the app, **without changing any existing query or RLS policy yet**. After this phase the app behaves identically; we've only added scaffolding.

Deliverables:
- Migration: `workspaces`, `workspace_members`, `workspace_branding` tables + indexes + GRANTs + RLS (members-can-read-own-workspace).
- Migration: `reserved_subdomains` table seeded with `www, app, admin, api, mail, static, cdn, flow, nflow, ncall, nevorai, support, help, docs, blog, status, auth, login, signup, billing, public, assets, internal`.
- Security-definer fn `public.is_workspace_member(_ws uuid)` and `public.current_workspace_id()` (reads a request-scoped GUC; returns NULL for now).
- Server fn `resolveTenant({ host })` → `{ workspace, branding } | null`, with in-memory LRU + 60s TTL.
- React `TenantProvider` reading from a public TanStack server route `/api/public/tenant/resolve` (host-based, no auth required, anon RLS).
- `useTenant()` hook returning `{ workspace, branding, isFallback }`. Returns the "legacy" workspace on `nevorai.com` / `flow.nevorai.com` / `lovable.app` so existing code paths see a stable workspace_id from day one.
- Backfill migration: create one "legacy" workspace (slug = `legacy`, status = `active`) and one `workspace_members` row for every existing `auth.users` user (role = `owner` or `member` depending on existing team role).
- No table outside of the four new ones is touched. No existing query changes. No RLS on any existing table is modified.

End-of-phase verification (I run, you confirm):
- `select count(*) from workspaces` = 1 (`legacy`)
- `select count(*) from workspace_members` = `count(*) from auth.users`
- All existing pages load, login works, funnel viewer works, tracking still fires, admin still loads.
- New `/api/public/tenant/resolve?host=flow.nevorai.com` returns the legacy workspace.

Risks: low. Worst case: drop the 4 new tables, no rollback complexity.

### Phase 1 — Tenant column rollout (additive, dual-read)

For every tenant table (funnels, landing_pages, video_assets, live_sessions, leads, crm_*, follow_ups, tracking_*, notifications_*, nev_ai_usage, academy_*, team_*, etc. — exhaustive list compiled from a schema scan in Phase 0):

- Add `workspace_id uuid` (nullable) with FK to `workspaces(id)`.
- Backfill: every existing row → `legacy` workspace.
- Add composite indexes `(workspace_id, <existing hot column>)` for every hot path.
- Add a **shadow RLS policy** (additive, not replacing) that allows access when `workspace_id` matches `current_workspace_id()` GUC OR existing policy passes. This is a temporary OR-bridge; lets us deploy without breaking anything.
- Add a Postgres trigger that auto-fills `workspace_id` from `auth.uid()`'s default workspace on INSERT if NULL.
- App layer: `supabase` client wrapper injects `set_config('app.workspace_id', ...)` per request via PostgREST `headers` (uses Supabase's `request.jwt.claims`-style GUC pattern through a custom JWT claim added at sign-in).

Verification: same regression suite as Phase 0 + cross-tenant probe test (create workspace B, prove user from A cannot see B's rows even though RLS isn't yet strict).

### Phase 2 — RLS hardening (strict mode, behind feature flag)

- Per-tenant table: replace shadow policies with strict `is_workspace_member(workspace_id)` policies.
- Flip `workspace_id` to `NOT NULL` (now safe — backfill done in Phase 1).
- Drop the OR-bridge. Old per-user policies remain only where they're correct intersections (e.g., `auth.uid() = owner_id AND is_workspace_member(workspace_id)`).
- All server functions audited: any `supabaseAdmin` write that touches a tenant table must now pass `workspace_id` explicitly.
- Admin Panel gets a workspace switcher (admin role bypasses `is_workspace_member` via a separate `is_platform_admin()` predicate).

Verification: automated RLS test suite (one Vitest file per tenant table) that signs in as user_A in workspace_A and asserts 0 rows visible from workspace_B.

### Phase 3 — Tenant routing & branding UI

- Cloudflare Worker script (delivered as a file + step-by-step deploy runbook you run in your CF dashboard — I cannot deploy it for you):
  - Matches `*.nevorai.com`
  - Sets `x-forwarded-host: <subdomain>.nevorai.com`
  - Proxies to `nevorai.lovable.app`
  - Strips/rewrites cookies so each subdomain has its own jar
- DNS: wildcard `*.nevorai.com` CNAME → Worker (you do this in CF).
- App: `resolveTenant` switches from "always legacy" to actual host → workspace lookup. Legacy hosts still resolve to legacy workspace.
- Dynamic favicon, page title, theme color, primary/secondary CSS variables driven by `workspace_branding`.
- Landing pages, funnel public viewer, lead form, all email templates pick up workspace branding.
- Local dev: `?tenant=missionmanager` query param overrides host for testing without DNS.

Verification: deploy a test workspace `mm.nevorai.com`, confirm full visual swap end-to-end; legacy `flow.nevorai.com` unchanged.

### Phase 4 — PWA & installability per workspace

- `/manifest.webmanifest` becomes a server route, returns workspace-specific JSON.
- Per-workspace icon set generated on logo upload (R2, 192/256/384/512 + maskable + apple-touch).
- `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon">` all driven by tenant.
- Document install-time caching caveat in admin UI ("renaming subdomain requires reinstall").

### Phase 5 — Admin & customer workspace management

- Admin panel: create / approve / suspend / delete workspace, upload branding, assign plan, assign features, impersonate.
- Customer: workspace settings page — name, logo, primary/secondary colors, favicon, subdomain availability check (Postgres unique + reserved-list check), email-from name.
- Subdomain takeover guard: deleting a workspace marks `slug` as tombstoned for 90 days.
- Graceful error pages for: unknown host, suspended workspace, expired subscription, deleted workspace.

### Phase 6 — Hardening, observability, decommissioning bridges

- Drop any remaining OR-bridge policies left for safety.
- Add audit log `workspace_audit_events`.
- Add per-workspace rate limiting on public endpoints.
- Cross-tenant leak fuzz tests in CI.
- Performance pass: `EXPLAIN ANALYZE` on top 20 queries, add missing indexes.
- Update `.lovable/plan.md` with final architecture diagram.

## Technical Section (for engineering reference)

**Tenant resolution flow**
```text
Browser → CF Worker (*.nevorai.com)
       → sets x-forwarded-host
       → nevorai.lovable.app (Lovable origin)
       → __root.tsx server-side loader calls /api/public/tenant/resolve
       → returns { workspace_id, slug, branding }
       → TenantProvider hydrates client
       → Supabase client wrapper attaches workspace_id to JWT claim on sign-in
       → Postgres RLS reads claim via current_workspace_id()
```

**Tables added in Phase 0**
- `workspaces (id, slug unique, name, status, plan, owner_user_id, created_at, deleted_at)`
- `workspace_branding (workspace_id pk/fk, logo_url, favicon_url, primary_color, secondary_color, theme_color, app_name, email_from_name, updated_at)`
- `workspace_members (workspace_id, user_id, role enum[owner|admin|member|viewer], pk(workspace_id,user_id))`
- `reserved_subdomains (slug pk, reason)`

**Files added in Phase 0**
- `supabase/migrations/<ts>_phase0_workspaces.sql`
- `src/lib/tenant.functions.ts` (`resolveTenant`)
- `src/routes/api/public/tenant/resolve.ts`
- `src/contexts/TenantProvider.tsx`
- `src/hooks/useTenant.ts`

**No files modified in Phase 0** except `src/routes/__root.tsx` (wrap children in `<TenantProvider>`).

## What I need from you to start Phase 0

Just say "go phase 0". I'll execute it, run the verification queries, post the diff summary, and stop. We do not start Phase 1 until you confirm Phase 0 is stable in production.

## What you will need to do yourself (cannot be done from inside Lovable)

- **Phase 3**: Deploy the Cloudflare Worker + add wildcard DNS in your CF dashboard. I'll give you the exact Worker script + click-by-click runbook.
- **Phase 3**: Issue/confirm Universal SSL covers `*.nevorai.com` (free, automatic in CF; just need to verify).
- **Phase 4**: Approve the per-workspace icon storage bucket policy on first run.

Everything else (DB, app, RLS, server functions, UI) I handle inside Lovable.
