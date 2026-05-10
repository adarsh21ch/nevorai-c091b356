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
  const { data: liveStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["trial-status", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const [{ data: profileRow }, { data: activePaidSubscription }] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("subscription_status, trial_start_date")
          .eq("id", user.id)
          .maybeSingle(),
        (supabase as any)
          .from("user_subscriptions")
          .select("tier")
          .eq("user_id", user.id)
          .eq("status", "active")
          .neq("tier", "free")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        subscriptionStatus: activePaidSubscription ? "active" : (profileRow as any)?.subscription_status || "trial",
        trialStartDate: (profileRow as any)?.trial_start_date || null,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const isTrialEnabled = settings?.isTrialEnabled ?? true;
  const trialDays = settings?.trialDays ?? 7;

  const status = liveStatus?.subscriptionStatus || (profile as any)?.subscription_status || "trial";
  const startRaw = liveStatus?.trialStartDate || (profile as any)?.trial_start_date;

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
    isLoading: settingsLoading || (!!user && statusLoading),
  };
};
