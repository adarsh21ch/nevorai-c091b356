/**
 * Staged-launch feature flags.
 * Flip a flag to `true` to enable the feature across the app (sidebar,
 * tools tabs, dashboard, etc.). One config change, no code edits needed.
 *
 * Launch plan:
 *   Week 1 — Videos + Funnels (LANDING_PAGES_ENABLED=false, LIVE_ENABLED=false)
 *   Week 2 — Landing Pages goes live (LANDING_PAGES_ENABLED=true)
 *   Week 3 — Live Sessions goes live (LIVE_ENABLED=true)
 */
export const FEATURE_FLAGS = {
  LANDING_PAGES_ENABLED: false,
  LIVE_ENABLED: false,
} as const;
