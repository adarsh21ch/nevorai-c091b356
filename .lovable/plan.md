## Goal

Finish the project: remove dead code, run a real QA pass on every page, and apply the remaining performance wins identified in the previous audit.

---

## 1. Cleanup

- Delete `src/pages/AppPages.tsx` (unused — no imports anywhere in the project, contains the old "Coming up next" placeholder).

## 2. Full QA pass (browser-driven)

Walk the live preview and verify each route renders, is interactive, and has no console errors. Fix anything broken inline.

**Public / marketing**
- `/`, `/about`, `/features`, `/pricing`, `/faq`, `/contact`, `/enterprise`, `/privacy`, `/terms`, `/refund-policy`, `/install`

**Auth**
- `/auth`, `/auth/reset-password`, `/auth/update-password`

**Authenticated app**
- `/dashboard`, `/onboarding`, `/profile`, `/settings`, `/billing`, `/upgrade`, `/notifications`, `/kyc`, `/analytics`, `/insights`, `/payments`, `/leads`, `/videos`, `/live`
- `/funnels`, `/funnels/create`, `/funnels/:id`, `/funnels/:id/edit`
- `/landing-pages`, `/landing-pages/create`, `/landing-pages/:id`, `/landing-pages/:id/edit`

**Admin (the original failing area)**
- `/admin`, `/admin/users`, `/admin/subscriptions`, `/admin/kyc`, `/admin/whatsapp`, `/admin/support`, `/admin/settings`, `/admin/videos`

**Public viewers**
- `/f/:slug`, `/f/:slug/member`, `/l/:slug`, `/s/:slug`, `/v/:id`, `/live/:id`, `/checkout/return`

For each: navigate via the browser tool, check console for errors, click primary CTAs (tabs, "Create" buttons, form submits where safe). Capture and fix any blank screen, hydration mismatch, or runtime error.

## 3. Remaining performance optimizations

- **Lucide deep imports**: replace barrel imports in the 6 hottest files (`DashboardLayout`, `AdminLayout`, `Navbar`, `DashboardKpiStrip`, `FunnelEditor`, `LandingPageEditor`) with `lucide-react/dist/esm/icons/<name>` to drop ~150 KB from the cold chunk.
- **`placeholderData: keepPreviousData`**: add to the tab-switch queries in `FunnelsPage`, `LeadsPage`, `PaymentsPage`, and the admin tabs so cached data renders instantly while revalidating.
- **Lazy editor panels**: convert `TestimonialsBuilderStep`, `ViewTiersManager`, `PlanEditorTable`, `MemberGatewayTab`, `EnterpriseInquiriesTab`, `RefundsTab` to `React.lazy` + `Suspense` so the editor shell paints first.
- **Modulepreload hints**: add `<link rel="modulepreload">` for `/dashboard`, `/funnels`, `/admin` chunks in `__root.tsx` head so post-login navigation feels instant.
- **Image weight**: stop using the 127 KB `nevorai-mark.png` inline; use the existing `<Logo />` SVG. Keep the PNG only for `og:image` / favicon.

## 4. Verification

- After perf changes: run `browser--performance_profile` and confirm cold load < 4 s, FCP < 2.5 s, no script > 800 ms self-time.
- After QA: every route in section 2 must render without a console error and the primary CTA must be clickable.

## Out of scope

- No DB schema changes.
- No new features beyond what already exists.
- No marketing redesign.

## Technical notes

- Lucide tree-shaking under Vite only works with deep imports — barrel imports always cost the full bundle.
- `keepPreviousData` is preferred over `staleTime: Infinity` for tab UIs because it shows cached data immediately and revalidates in the background.
- Modulepreload is a hint, not a hard fetch — safe to add for likely-next routes.
