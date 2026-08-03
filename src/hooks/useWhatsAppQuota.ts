import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAccess } from "@/hooks/useEffectiveAccess";

/**
 * Reads the current user's WhatsApp monthly usage counter alongside
 * the cap from their effective plan. `cap = -1` means unlimited.
 * The send path in the edge function is the authoritative gate; this
 * hook drives UI (progress bars, upgrade prompts).
 */
export const useWhatsAppQuota = () => {
  const { user } = useAuth();
  const { access } = useEffectiveAccess();

  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  const usage = useQuery({
    queryKey: ["wa-usage", user?.id, period],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("whatsapp_monthly_usage")
        .select("sent_count")
        .eq("user_id", user!.id)
        .eq("period_ym", period)
        .maybeSingle();
      return (data?.sent_count ?? 0) as number;
    },
  });

  const cap = useQuery({
    queryKey: ["wa-cap", access?.plan_slug],
    enabled: !!access?.plan_slug,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_plans")
        .select("whatsapp_monthly_cap")
        .eq("plan_name", access!.plan_slug)
        .maybeSingle();
      return (data?.whatsapp_monthly_cap ?? 0) as number;
    },
  });

  const sent = usage.data ?? 0;
  const capValue = cap.data ?? 0;
  const isUnlimited = capValue === -1;
  const remaining = isUnlimited ? Infinity : Math.max(0, capValue - sent);
  const isBlocked = !isUnlimited && sent >= capValue;
  const percent = isUnlimited || capValue === 0 ? 0 : Math.min(100, Math.round((sent / capValue) * 100));

  return {
    sent,
    cap: capValue,
    isUnlimited,
    remaining,
    isBlocked,
    percent,
    isLoading: usage.isLoading || cap.isLoading,
  };
};
