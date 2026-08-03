import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePlan } from "./usePlan";
import { useResourceCount } from "./useResourceCount";

export interface PlanConfig {
  plan_name: string;
  yearly_validity_days: number;
  max_funnels: number;
  max_landing_pages: number;
  max_live_sessions: number;
  max_team_members: number;
  // max_videos REMOVED — storage is now the only constraint on uploads.
  max_storage_mb: number;
  multilevel_funnel_enabled: boolean;
  is_enabled?: boolean;
  feature_lead_capture?: boolean;
  feature_analytics?: boolean;
  feature_whatsapp_automation?: boolean;
  feature_video_sharing?: boolean;
  feature_priority_support?: boolean;
  feature_advanced_analytics?: boolean;
  feature_go_live?: boolean;
  feature_landing_pages?: boolean;
  feature_landing_page_email?: boolean;
  feature_team_analytics?: boolean;
  feature_video_upload?: boolean;
  feature_insights?: boolean;
  feature_funnel_creation?: boolean;
  feature_speaker_profile?: boolean;
  feature_video_topics?: boolean;
  feature_contact_form?: boolean;
  feature_privacy_settings?: boolean;
  feature_youtube_import?: boolean;
  feature_smart_reminders?: boolean;
  feature_custom_branding?: boolean;
  feature_prospect_analytics?: boolean;
  daily_view_limit?: number;
  max_leads?: number;
  plan_badge_text?: string | null;
  feature_custom_form_fields?: boolean;
  feature_skip_control?: boolean;
  max_custom_form_fields?: number;
  /** New consolidated flag (Goal 2). Falls back to ANY-of-5 legacy flags when absent. */
  feature_advanced_funnel_customization?: boolean;
}

const FREE_FALLBACK: PlanConfig = {
  plan_name: "free",
  yearly_validity_days: 0,
  max_funnels: 0,
  max_landing_pages: 0,
  max_live_sessions: 0,
  max_team_members: 0,
  max_storage_mb: 0,
  multilevel_funnel_enabled: false,
};

export const usePlanLimits = () => {
  const { user } = useAuth();
  const { plan } = usePlan();
  const counts = useResourceCount();

  const { data: planConfigs = [] } = useQuery({
    queryKey: ["plan-configs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("subscription_plans").select("*");
      return (data || []) as PlanConfig[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: teamCount = 0 } = useQuery({
    queryKey: ["team-member-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await (supabase as any)
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .in("status", ["pending", "active"]);
      return count || 0;
    },
    enabled: !!user && (plan.tier === "pro" || plan.tier === "growth" || plan.tier === "leader"),
  });

  const tier = plan.tier;
  const lookupTier = tier === "trial" ? "growth" : tier;
  const config = planConfigs.find(c => c.plan_name === lookupTier) || FREE_FALLBACK;

  const isFree = tier === "free" || (!plan.isPaid && tier !== "trial");

  const teamCapableTier = tier === "pro" || tier === "growth" || tier === "leader";

  // Admin-allocated quotas are authoritative: if max_* > 0 (or -1 for unlimited),
  // the user can create up to that count regardless of the feature flag.
  // Feature flag only blocks when admin explicitly set max to 0.
  const canCreateFunnel = config.max_funnels === -1 || (config.max_funnels > 0 && counts.funnels < config.max_funnels);
  const canCreateLandingPage = config.max_landing_pages === -1 || (config.max_landing_pages > 0 && counts.landing_pages < config.max_landing_pages);
  const canCreateLive = config.max_live_sessions === -1 || (config.max_live_sessions > 0 && counts.live_sessions < config.max_live_sessions);
  const canUseMultilevel = config.multilevel_funnel_enabled;
  const canAddTeamMember = teamCapableTier && (config.max_team_members === -1 || teamCount < config.max_team_members);
  // Storage is the only quota — see useStorageUsage for the enforced check.
  const canUploadVideo = config.feature_video_upload === true;

  const isFunnelLimitReached = config.max_funnels !== -1 && counts.funnels >= config.max_funnels;
  const isLandingPageLimitReached = config.max_landing_pages !== -1 && counts.landing_pages >= config.max_landing_pages;
  const isLiveLimitReached = config.max_live_sessions !== -1 && counts.live_sessions >= config.max_live_sessions;
  const isTeamLimitReached = teamCapableTier && config.max_team_members !== -1 && teamCount >= config.max_team_members;
  const isVideoLimitReached = false; // Deprecated — storage limit is enforced by useStorageUsage.

  // Goal 1: prospectAnalytics / insights / teamAnalytics now DERIVE from
  // feature_advanced_analytics. Legacy per-flag columns are ignored.
  const advancedAnalytics = config.feature_advanced_analytics === true;

  // Goal 2: speakerProfile / videoTopics / contactForm / privacySettings /
  // customFormFields now DERIVE from feature_advanced_funnel_customization.
  // Until the DB migration has been applied, fall back to ANY-of-5 legacy
  // flags so behavior is unchanged.
  const advancedFunnelCustomization =
    typeof config.feature_advanced_funnel_customization === "boolean"
      ? config.feature_advanced_funnel_customization
      : (
        config.feature_speaker_profile === true ||
        config.feature_video_topics === true ||
        config.feature_contact_form === true ||
        config.feature_privacy_settings === true ||
        config.feature_custom_form_fields === true
      );

  const features = {
    leadCapture: config.feature_lead_capture !== false,
    analytics: config.feature_analytics !== false,
    whatsappAutomation: config.feature_whatsapp_automation === true,
    videoSharing: config.feature_video_sharing === true,
    prioritySupport: config.feature_priority_support === true,
    advancedAnalytics,
    multilevelFunnels: config.multilevel_funnel_enabled,
    teamMembers: teamCapableTier && config.max_team_members !== 0,
    // Derived from advancedAnalytics (Goal 1).
    teamAnalytics: advancedAnalytics,
    goLive: config.feature_go_live !== false,
    landingPages: config.feature_landing_pages !== false,
    landingPageEmail: config.feature_landing_page_email === true,
    videoUpload: config.feature_video_upload === true,
    // Derived from advancedAnalytics (Goal 1).
    insights: advancedAnalytics,
    funnelCreation: config.feature_funnel_creation !== false,
    youtubeImport: config.feature_youtube_import === true,
    smartReminders: config.feature_smart_reminders === true,
    customBranding: config.feature_custom_branding === true,
    // Derived from advancedAnalytics (Goal 1).
    prospectAnalytics: advancedAnalytics,
    // Derived from advancedFunnelCustomization (Goal 2).
    advancedFunnelCustomization,
    speakerProfile: advancedFunnelCustomization,
    videoTopics: advancedFunnelCustomization,
    contactForm: advancedFunnelCustomization,
    privacySettings: advancedFunnelCustomization,
    customFormFields: advancedFunnelCustomization,
    skipControl: config.feature_skip_control === true,
  };

  return {
    tier, isFree, config, counts, teamCount,
    canCreateFunnel, canCreateLandingPage, canCreateLive, canUseMultilevel,
    canAddTeamMember, canUploadVideo,
    isFunnelLimitReached, isLandingPageLimitReached, isLiveLimitReached,
    isTeamLimitReached, isVideoLimitReached,
    planConfigs, features,
  };
};
