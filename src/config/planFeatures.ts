/**
 * Single source of truth for everything the admin plan editor manages.
 *
 * Add a new entry here → it automatically appears as a row in the admin
 * comparison table and is persisted to the matching `subscription_plans` column.
 *
 * `dbField` is the actual column in `subscription_plans`. A few entries use a
 * `transform` so the admin sees friendly units (e.g. GB) while we store MB.
 */

/** DB is the source of truth — plans are arbitrary lowercase identifiers. */
export type PlanKey = string;

export type PlanFeatureCategory = "Limits" | "Features" | "Pricing";

export interface PlanFeatureBase {
  key: string;
  label: string;
  category: PlanFeatureCategory;
  hint?: string;
  dbField: string;
  /** Hide this row entirely for the named plans (still editable in DB). */
  hideFor?: PlanKey[];
  /**
   * Deprecated flag — kept in DB for one release cycle but hidden from the
   * admin plan editor so admins can't misconfigure it. Behavior is now
   * derived from a consolidated flag (see planFeatures.ts header).
   */
  deprecated?: boolean;
}

export interface NumberFeature extends PlanFeatureBase {
  type: "number";
  step?: number;
  /** Convert UI value → DB value (e.g. GB → MB). */
  toDb?: (uiValue: number | null) => number | null;
  /** Convert DB value → UI value. */
  fromDb?: (dbValue: number | null | undefined) => number | null;
}

export interface BooleanFeature extends PlanFeatureBase {
  type: "boolean";
}

export interface TextFeature extends PlanFeatureBase {
  type: "text";
}

export interface SelectFeature extends PlanFeatureBase {
  type: "select";
  options: { value: string; label: string }[];
}

export type PlanFeature = NumberFeature | BooleanFeature | TextFeature | SelectFeature;

export const PLAN_FEATURES: PlanFeature[] = [
  // ─── LIMITS ────────────────────────────────────────────────
  {
    key: "view_limit_mode",
    label: "★ View Limit Mode",
    type: "select",
    category: "Limits",
    hint: "Monthly is the standard. Daily/Both are legacy and no longer selectable.",
    dbField: "view_limit_mode",
    // Only Monthly is selectable going forward. Existing plans still on
    // daily/both keep their current mode (enforcement code untouched).
    options: [
      { value: "monthly", label: "📆 Monthly" },
    ],
  },
  { key: "monthly_views", label: "Monthly View Limit", type: "number", category: "Limits", hint: "Used when mode is monthly/both. -1 = unlimited", dbField: "monthly_views" },
  { key: "max_daily_views", label: "Daily View Limit", type: "number", category: "Limits", hint: "Used when mode is daily/both. -1 = unlimited", dbField: "daily_view_limit" },
  { key: "extra_views_unit_size", label: "Extra-Views Unit Size", type: "number", category: "Limits", hint: "Views per top-up purchase", dbField: "extra_views_unit_size" },
  { key: "extra_views_price_per_unit", label: "Extra-Views Price (₹)", type: "number", category: "Limits", hint: "Price per top-up unit", dbField: "extra_views_price_per_unit" },
  { key: "max_funnels", label: "Max Funnels", type: "number", category: "Limits", hint: "-1 = unlimited", dbField: "max_funnels" },
  { key: "max_leads_export", label: "Leads CSV Export / month", type: "number", category: "Limits", hint: "-1 = unlimited", dbField: "max_leads_export" },
  // max_videos removed — storage is now the only video constraint.
  {
    key: "max_storage_gb",
    label: "Max Storage (GB)",
    type: "number",
    category: "Limits",
    hint: "0.5 = 500MB · -1 = unlimited",
    dbField: "max_storage_mb",
    step: 0.1,
    toDb: (gb) => (gb == null ? null : gb === -1 ? -1 : Math.round(gb * 1024)),
    fromDb: (mb) => (mb == null ? null : mb === -1 ? -1 : Math.round((mb / 1024) * 100) / 100),
  },
  { key: "max_landing_pages", label: "Max Landing Pages", type: "number", category: "Limits", hint: "-1 = unlimited", dbField: "max_landing_pages" },
  { key: "max_live_sessions", label: "Max Live Sessions", type: "number", category: "Limits", hint: "-1 = unlimited", dbField: "max_live_sessions" },
  { key: "max_leads", label: "Max Leads Stored", type: "number", category: "Limits", hint: "-1 = unlimited", dbField: "max_leads" },
  { key: "max_team_members", label: "Max Downline Seats", type: "number", category: "Limits", hint: "Sub-members under a Leader. -1 = unlimited", dbField: "max_team_members" },
  { key: "max_custom_form_fields", label: "Custom Form Fields per Funnel", type: "number", category: "Limits", hint: "-1 = unlimited · 0 = blocked", dbField: "max_custom_form_fields" },

  // ─── FEATURES ─────────────────────────────────────────────
  { key: "feature_funnel_creation", label: "Funnel Creation", type: "boolean", category: "Features", dbField: "feature_funnel_creation" },
  { key: "feature_lead_capture", label: "Lead Capture", type: "boolean", category: "Features", dbField: "feature_lead_capture" },
  { key: "feature_video_upload", label: "Video Upload", type: "boolean", category: "Features", dbField: "feature_video_upload" },
  { key: "feature_skip_control", label: "Skip-Forward Control", type: "boolean", category: "Features", hint: "Allow creators to disable viewer skip-forward on their videos", dbField: "feature_skip_control" },
  { key: "feature_youtube_import", label: "YouTube Video Import", type: "boolean", category: "Features", dbField: "feature_youtube_import" },
  { key: "feature_video_sharing", label: "Video Sharing", type: "boolean", category: "Features", dbField: "feature_video_sharing" },
  { key: "feature_landing_pages", label: "Landing Pages", type: "boolean", category: "Features", dbField: "feature_landing_pages" },
  { key: "feature_landing_page_email", label: "Landing Page Confirmation Email", type: "boolean", category: "Features", hint: "Send branded confirmation email to prospects after they register on a landing page", dbField: "feature_landing_page_email" },
  { key: "feature_go_live", label: "Live Broadcast", type: "boolean", category: "Features", dbField: "feature_go_live" },
  { key: "feature_whatsapp_automation", label: "WhatsApp Auto-Message", type: "boolean", category: "Features", dbField: "feature_whatsapp_automation" },
  { key: "feature_smart_reminders", label: "Smart Follow-up Reminders", type: "boolean", category: "Features", dbField: "feature_smart_reminders" },
  { key: "feature_analytics", label: "Analytics Dashboard", type: "boolean", category: "Features", hint: "Basic: can I see who watched", dbField: "feature_analytics" },
  { key: "feature_advanced_analytics", label: "Advanced Analytics", type: "boolean", category: "Features", hint: "Deep analytics — also gates Insights Dashboard, Per-Prospect Watch, and Leader Dashboard", dbField: "feature_advanced_analytics" },
  { key: "feature_advanced_funnel_customization", label: "Advanced Funnel Customization", type: "boolean", category: "Features", hint: "Bundles Speaker Profile, Video Topics, Contact Form, Privacy & Access Codes, and Custom Form Fields", dbField: "feature_advanced_funnel_customization" },
  { key: "multilevel_funnel_enabled", label: "Multi-Step Funnels", type: "boolean", category: "Features", dbField: "multilevel_funnel_enabled" },
  { key: "feature_custom_branding", label: "Custom Branding", type: "boolean", category: "Features", dbField: "feature_custom_branding" },
  { key: "feature_show_branding", label: "Show Nevorai Watermark", type: "boolean", category: "Features", hint: "If on, public funnel/landing/video pages show 'Made with Nevorai' badge", dbField: "feature_show_branding" },
  { key: "feature_priority_support", label: "Priority Support", type: "boolean", category: "Features", dbField: "feature_priority_support" },

  // ─── DEPRECATED (hidden from admin editor; kept for one release cycle) ─
  { key: "feature_prospect_analytics", label: "Per-Prospect Watch Analytics (deprecated → Advanced Analytics)", type: "boolean", category: "Features", dbField: "feature_prospect_analytics", deprecated: true },
  { key: "feature_insights", label: "Insights Dashboard (deprecated → Advanced Analytics)", type: "boolean", category: "Features", dbField: "feature_insights", deprecated: true },
  { key: "feature_team_analytics", label: "Leader Dashboard (deprecated → Advanced Analytics)", type: "boolean", category: "Features", dbField: "feature_team_analytics", deprecated: true },
  { key: "feature_speaker_profile", label: "Speaker Profile (deprecated → Advanced Funnel Customization)", type: "boolean", category: "Features", dbField: "feature_speaker_profile", deprecated: true },
  { key: "feature_video_topics", label: "Video Topics (deprecated → Advanced Funnel Customization)", type: "boolean", category: "Features", dbField: "feature_video_topics", deprecated: true },
  { key: "feature_contact_form", label: "Contact Form (deprecated → Advanced Funnel Customization)", type: "boolean", category: "Features", dbField: "feature_contact_form", deprecated: true },
  { key: "feature_privacy_settings", label: "Privacy & Access Codes (deprecated → Advanced Funnel Customization)", type: "boolean", category: "Features", dbField: "feature_privacy_settings", deprecated: true },
  { key: "feature_custom_form_fields", label: "Custom Form Fields (deprecated → Advanced Funnel Customization)", type: "boolean", category: "Features", dbField: "feature_custom_form_fields", deprecated: true },

  // ─── PRICING ───────────────────────────────────────────────
  // Monthly/Yearly prices now live in plan_tiers (managed via ViewTiersManager).
  { key: "yearly_validity_days", label: "Yearly Validity (days)", type: "number", category: "Pricing", dbField: "yearly_validity_days", hideFor: ["free"] },
  { key: "plan_badge_text", label: "Badge Text", type: "text", category: "Pricing", hint: "Shown on landing page", dbField: "plan_badge_text", hideFor: ["free"] },
];

/**
 * @deprecated Use `useAllPlans()` from `@/hooks/usePlans` — plan list is now
 * driven by `subscription_plans.display_order`. Kept only as a fallback ordering for
 * code that has no access to React Query state.
 */
export const PLAN_KEYS_ORDER: PlanKey[] = ["free", "starter", "basic", "growth", "pro", "leader"] as any;

/**
 * @deprecated Use `display_name` from `subscription_plans` (via `useAllPlans()` /
 * `planLabel()`). Fallback labels only.
 */
export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  growth: "Growth",
  pro: "Pro",
};
