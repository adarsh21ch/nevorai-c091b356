## Goal

1. Make "Add to Home Screen" feel like a real installed app (no Safari chrome) — your previous answer was the right one; my last change downgraded it. Revert.
2. Finish what's still inconsistent: bring the **Live Session** editor up to the same Cloudflare-style scrollable layout as Funnel + Landing Page (it currently renders stacked sections but has no sidebar nav and still carries leftover `step` state).

---

## Part A — PWA: native-app feel

Revert `public/manifest.webmanifest`:
- `display`: `"browser"` → **`"standalone"`** (no URL bar, no tabs — pure app shell)
- `start_url`: `"/"` → **`"/dashboard"`** (opens straight into the app like a native one would)
- Restore `"orientation": "portrait"`

Keep:
- The kill-switch service workers at `/sw.js` and `/service-worker.js` (they still nuke any stale old SW from previous deploys — that's the actual 404 fix).
- The runtime SW unregister in `__root.tsx` (belt + braces).

Caveat (iOS limitation, not fixable in code): users who already added the site to their Home Screen while we briefly had `display: browser` will keep that pinned setting. They'd need to re-add to pick up `standalone`. Fresh installs from now on get the native-app experience.

---

## Part B — Live Session editor: finish the scrollable refactor

Current state of `src/pages/LivePage.tsx`:
- ✅ Step gates already removed (all sections render stacked)
- ❌ Still has unused `step` / `setStep` state and reset calls
- ❌ Doesn't use `EditorScrollLayout` → no sidebar scroll-spy, no mobile chip bar, no sticky Save — inconsistent with Funnel + Landing

Changes:
1. Define a `WIZARD_STEPS`-style section list (id, title, completion check) matching the existing section blocks already in the JSX.
2. Wrap the form body in `<EditorScrollLayout sections={…} header={…}>` and map each existing section into an `<EditorSectionBlock id=… title=…>` wrapper so the sidebar / mobile chips light up as the user scrolls.
3. Remove `step` / `setStep` state and the three `setStep(1)` resets.
4. Apply ON-by-default to live-session toggles that exist (e.g. `allow_speed_change` if present in the form state) — same treatment as Funnel.

No changes to: save logic, scheduling logic, public viewer (`/s/$slug`), auth, payments, RLS.

---

## Verification

- `bunx tsc --noEmit` → 0 errors
- Live Session editor opens with sticky sidebar (desktop) / chip bar (mobile), Save in header, all sections visible from the start
- Funnel + Landing Page editors unchanged
- Manifest re-served as standalone — installing on a fresh device gives a chromeless, native-feeling window opening to `/dashboard`
