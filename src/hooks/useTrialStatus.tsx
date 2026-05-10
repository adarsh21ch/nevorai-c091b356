import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TrialStatus {
  isTrialEnabled: boolean;
  trialDays: number;
  daysRemaining: number | null;
  isTrialExpired: boolean;
  subscriptionStatus: string;
  isLoading: boolean;
}

export const useTrialSettings = () => {
  return useQuery({
    queryKey: ["app-settings-trial"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("key, value")
        .in("key", ["trial_enabled", "trial_days"]);
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value; });
      return {
        isTrialEnabled: map.trial_enabled === "true",
        trialDays: parseInt(map.trial_days || "7", 10),
      };
    },
    staleTime: 60_000,
  });
};

export const useTrialStatus = (): TrialStatus => {
  const { user, profile } = useAuth();
  const { data: settings, isLoading: settingsLoading } = useTrialSettings();

  const isTrialEnabled = settings?.isTrialEnabled ?? true;
  const trialDays = settings?.trialDays ?? 7;

  const status = (profile as any)?.subscription_status || "trial";
  const startRaw = (profile as any)?.trial_start_date;

  let daysRemaining: number | null = null;
  let isTrialExpired = false;

  if (isTrialEnabled && startRaw && status === "trial") {
    const start = new Date(startRaw);
    const diffDays = Math.floor((Date.now() - start.getTime()) / 86_400_000);
    daysRemaining = Math.max(0, trialDays - diffDays);
    isTrialExpired = diffDays >= trialDays;
  }

  if (!isTrialEnabled || status === "active") {
    isTrialExpired = false;
    daysRemaining = null;
  }

  return {
    isTrialEnabled,
    trialDays,
    daysRemaining,
    isTrialExpired,
    subscriptionStatus: status,
    isLoading: settingsLoading || (!!user && !profile),
  };
};
