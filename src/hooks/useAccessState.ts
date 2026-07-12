import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTrialSettings } from "@/hooks/useTrialStatus";

export type AccessState = "active" | "grace" | "blocked";

export interface AccessStateResult {
  state: AccessState;
  graceEndsAt: Date | null;
  isLoading: boolean;
  freeAccessEnabled: boolean;
}

/**
 * Client-side mirror of the creator-access logic in
 * supabase/functions/get-funnel-data/index.ts. Used to render the amber/red
 * upgrade banners inside the creator's own dashboard / funnel editor.
 *
 * Does NOT gate any prospect-facing surface — the edge function is the
 * source of truth for that.
 */
export const useAccessState = (): AccessStateResult => {
  const { user, profile } = useAuth();
  const { data: trialSettings, isLoading: trialLoading } = useTrialSettings();

  const { data: freeSettings, isLoading: freeLoading } = useQuery({
    queryKey: ["app-settings-free-access"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("key, value")
        .in("key", [
          "free_access_enabled",
          "free_access_grace_days",
          "free_access_disabled_at",
        ]);
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        map[s.key] = s.value;
      });
      return {
        freeAccessEnabled: (map.free_access_enabled ?? "true") !== "false",
        graceDays: parseInt(map.free_access_grace_days || "3", 10),
        disabledAt: map.free_access_disabled_at
          ? new Date(map.free_access_disabled_at)
          : null,
      };
    },
    staleTime: 60_000,
  });

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["access-state-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("user_subscriptions")
        .select("tier, status, billing_type, expires_at")
        .eq("user_id", user.id)
        .in("status", ["active", "payment_failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const isLoading = trialLoading || freeLoading || (!!user && subLoading);

  if (!user || isLoading) {
    return {
      state: "active",
      graceEndsAt: null,
      isLoading,
      freeAccessEnabled: freeSettings?.freeAccessEnabled ?? true,
    };
  }

  const now = Date.now();
  const hasPaidSub =
    !!sub &&
    sub.status === "active" &&
    sub.tier !== "free" &&
    (!sub.expires_at || new Date(sub.expires_at).getTime() > now);

  const trialEnabled = trialSettings?.isTrialEnabled ?? true;
  const trialDays = trialSettings?.trialDays ?? 7;
  const trialStart = (profile as any)?.trial_start_date;
  const subStatus = (profile as any)?.subscription_status;
  let trialActive = false;
  if (trialEnabled && subStatus === "trial" && trialStart) {
    const elapsed = Math.floor((now - new Date(trialStart).getTime()) / 86_400_000);
    trialActive = elapsed < trialDays;
  }

  const manualGrant =
    !!sub && sub.status === "active" && sub.billing_type === "manual";

  const freeAccessEnabled = freeSettings?.freeAccessEnabled ?? true;
  const graceDays = freeSettings?.graceDays ?? 3;
  const disabledAt = freeSettings?.disabledAt ?? null;
  const graceEndsAt =
    disabledAt ? new Date(disabledAt.getTime() + graceDays * 86_400_000) : null;
  const graceActive =
    !freeAccessEnabled && !!graceEndsAt && now < graceEndsAt.getTime();

  let state: AccessState = "active";
  if (!(hasPaidSub || trialActive || manualGrant)) {
    if (freeAccessEnabled) state = "active";
    else if (graceActive) state = "grace";
    else state = "blocked";
  }

  return {
    state,
    graceEndsAt: state === "grace" || state === "blocked" ? graceEndsAt : null,
    isLoading: false,
    freeAccessEnabled,
  };
};
