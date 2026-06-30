## Goal

Two things in one production-ready pass:

1. Stop the **"Something went wrong"** card from appearing on every page in production.
2. Replace the self-serve **Workspace** concept with admin-managed **Applications** — only you (admin) can create one, assign it to a single user, and give it a subdomain like `client-name.nevorai.com`. The assigned user only sees their own Application.

---

## Part 1 — Why every page is currently broken (root cause)

What happened after the migrations:

- `phase3_split_and_swap.sql` **dropped every owner-only RLS policy** on every table that has a `workspace_id` column (this includes `profiles`, `user_subscriptions`, `funnels`, `videos`, `notifications`, etc.) and replaced them with **`same_workspace_as(workspace_id)`** policies.
- Those policies only return rows where the row's `workspace_id` matches one of the caller's `workspace_members` rows.
- Phase 3 also created a per-owner workspace for every user and backfilled their data. In theory this should keep everything working.
- In practice the failure mode is one of three things — all caused by Phase 3 + the new client code, and all fixable in one migration + one client patch:
  1. Some users / rows ended up with `workspace_id = legacy` (the splitter logs but does not fix this) → `same_workspace_as(legacy)` returns `false` → reads come back empty AND certain `.single()` callers in the app treat "no row" as an exception.
  2. The new `WorkspaceBrandingApplier` and `WorkspaceSwitcher` mount on every dashboard page and call `workspace_branding` / `workspace_members` queries that throw if the user has no membership row (e.g. brand-new signups where the membership trigger missed).
  3. The current `ErrorBoundary` swallows the real message, so every distinct cause shows the same generic card — masking the actual issue from us and from you.

**Fix strategy for Part 1**

1. **Diagnostic boundary already added** — surfaces the real error message in dev so we never have to guess again. Already in code; will be deployed.
2. **One repair migration** (`phaseR_repair.sql`) — idempotent:
   - Sweep every `workspace_id` column and re-point any rows still on `legacy` to the owner/user's primary workspace (or, when that fails, to a freshly minted workspace for them).
   - Guarantee every `auth.users` row has a `workspaces` row AND a `workspace_members` row with role `owner`. Use a backfill + a trigger on `auth.users` insert so future signups can't end up without a workspace.
   - Ensure the `same_workspace_as` function returns `true` for service-role calls (it already does via `SECURITY DEFINER`, but verify the GRANTs explicitly).
   - Grants double-checked on `workspaces`, `workspace_members`, `workspace_branding`.
3. **Client guards** (no behavior change for working users):
   - `useWorkspaces`, `useActiveWorkspace`, `useWorkspaceBranding` already return safe empties on error — verify nothing throws synchronously when `workspace_members` is empty.
   - `WorkspaceBrandingApplier` and `WorkspaceSwitcher` short-circuit when there's no active workspace (already true; will add a defensive `try/catch` around the `document.title` mutation just to be safe).
   - `useAuth.fetchProfile` will tolerate `null` / RLS-blocked profile rows instead of leaving `profile` undefined in a way that downstream code assumes.
4. **Verification**: after the migration, visit Dashboard, Funnels, Funnel Detail, Videos, Insights, Billing, Profile, Workspace Members, Branding, Settings — all must render without the error card. I'll run Playwright against the preview as smoke-test.

---

## Part 2 — Restructure into admin-managed Applications

Your model in plain terms:

- One "Application" = one client's dedicated website (their own subdomain, branding, content silo).
- **Only the platform admin (you) creates an Application** from the Admin Panel.
- An Application is assigned to exactly one user (the "owner client"). That user logs in and only sees their Application — no switcher, no "create new workspace" button.
- The Application's URL is `<slug>.nevorai.com` (plus optional custom domain later).

Concretely:

### Data model changes

- Reuse the existing `workspaces` table but treat it as the Applications table. No table rename (rename would break every existing query); we rename in the UI only.
- Lock down `workspaces` policies:
  - Regular users: **cannot INSERT/UPDATE/DELETE** workspaces (read-only to ones they're a member of).
  - Only `service_role` and users with `has_role(auth.uid(),'admin')` can INSERT/UPDATE/DELETE.
- `workspace_members`: admin-only INSERT/DELETE. Owner of an Application can still view the membership row.
- Remove "invite teammate" flow from regular users (the `workspace_invitations` table stays in the schema but the UI is hidden — admin manages assignment instead).

### Admin Panel — new "Applications" section

Route: `/admin/applications` (gated by `useAdmin`).

Features:
- **List**: name, slug (subdomain), assigned user (email + name), plan, status, created.
- **Create Application** modal:
  - Name
  - Slug (validated — lowercase, 3–40 chars, regex, not in reserved list `["admin","api","app","auth","www","nevorai","flow","nflow","launchpad","ncall"]`, unique).
  - Assign to user (searchable user picker — searches `profiles` by email/full_name).
  - Plan (free / basic / pro).
  - Optional initial branding (app name, primary color).
- **Edit Application**: rename, change slug, change plan, change status (active/suspended), transfer to another user.
- **Delete Application** (soft-delete via `deleted_at`).
- After Create: the assigned user, on next login, sees only that Application. Their app loads at `<slug>.nevorai.com` (already supported by `getCurrentTenant` host resolution in `tenant.functions.ts`).

### Regular user experience changes

- **Sidebar**: remove "Workspace Settings", "Members", "Branding" links for non-admin users. They auto-belong to one Application and don't manage it.
- **Workspace Switcher**: hidden for users with exactly one Application (already the case). For users with more than one (rare — multi-app clients), keep the switcher but rename the chip to "Application".
- **Branding** stays editable by the owner client on their own Application via a single "Branding" page inside their app (kept, just relabeled "Site Branding").
- **Invite/members** UI removed for non-admins. Admins manage assignment from `/admin/applications`.

### Wording

- "Workspace" → "Application" everywhere in user-facing copy.
- "Workspace Settings" → "Site Settings".
- "Workspace Members" page → removed from user nav (admins use `/admin/applications`).
- "Workspace Branding" → "Site Branding".

### Subdomain wiring

- Already handled server-side: `getCurrentTenant` resolves `<slug>.nevorai.com` to the workspace row. We just have to make sure:
  - The admin Create flow writes the slug correctly.
  - The DNS wildcard `*.nevorai.com` is pointed at the app (one-time Cloudflare task on your side — I'll surface this as a checklist item in the admin panel, not auto-configure DNS).
  - The "Open site" button in the Admin list copies/opens `https://<slug>.nevorai.com`.

---

## Part 3 — Order of work

1. Ship the diagnostic ErrorBoundary (already in code) + this plan.
2. Write `phaseR_repair.sql` — you run it in Supabase SQL editor. I'll output the exact SQL and a verify query you can paste to confirm zero broken rows.
3. After you confirm the repair migration succeeds, harden the client guards and remove the legacy "Workspace Members / Settings / Branding" links from the user sidebar.
4. Write `phaseA_applications.sql` — admin-only RLS lockdown on `workspaces` / `workspace_members`, reserved-slug enforcement, trigger to ensure every new `auth.users` row gets a workspace.
5. Build the Admin Panel "Applications" page (list / create / edit / delete / transfer).
6. Rename UI strings ("Workspace" → "Application" / "Site").
7. Playwright smoke test across all major pages + admin panel.
8. Single closing message with what to run, what changed, and how to test.

---

## What I need from you to start

Just one yes/no:

- **Confirm the model**: each Application has exactly **one** owner client (not "1 owner + many members"). If you want owner + optional teammates in the future, say so now and I'll keep the `workspace_members` table as the join (just hide invites from the regular UI).

Reply "go" and I will start with Step 2 (the repair migration). Reply with the answer to the question above if you want owner+team rather than strictly one-user-per-app.