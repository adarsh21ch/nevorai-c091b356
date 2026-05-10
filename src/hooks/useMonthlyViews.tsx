import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface MonthlyViewsStats {
  used: number;
  limit: number;
  planKey: string;
  resetAt: string;
  pct: number;
  isUnlimited: boolean;
  isOverLimit: boolean;
  isApproachingLimit: boolean;
  mode: "daily" | "monthly" | "both";
  dailyUsed: number;
  dailyLimit: number;
  dailyPct: number;
  isDailyUnlimited: boolean;
  isDailyOverLimit: boolean;
  isDailyApproachingLimit: boolean;
  extraPurchased: number;
}

const EMPTY: MonthlyViewsStats = {
  used: 0, limit: 0, planKey: "free", resetAt: new Date().toISOString(),
  pct: 0, isUnlimited: false, isOverLimit: false, isApproachingLimit: false,
  mode: "monthly", dailyUsed: 0, dailyLimit: 0, dailyPct: 0,
  isDailyUnlimited: false, isDailyOverLimit: false, isDailyApproachingLimit: false,
  extraPurchased: 0,
};

export const useMonthlyViews = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["monthly-views", user?.id],
    queryFn: async (): Promise<MonthlyViewsStats> => {
      if (!user) return EMPTY;
      const { data, error } = await (supabase as any).rpc("get_user_monthly_views", {
        _user_id: user.id,
      });
      if (error || !data) return EMPTY;
      const used = Number(data.used || 0);
      const limit = Number(data.limit ?? 0);
      const isUnlimited = limit === -1;
      const pct = isUnlimited || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);

      const dailyUsed = Number(data.daily_used || 0);
      const dailyLimit = Number(data.daily_limit ?? 0);
      const isDailyUnlimited = dailyLimit === -1;
      const dailyPct = isDailyUnlimited || dailyLimit <= 0 ? 0 : Math.min(100, (dailyUsed / dailyLimit) * 100);

      return {
        used, limit, planKey: data.plan_key || "free",
        resetAt: data.reset_at || new Date().toISOString(),
        pct, isUnlimited,
        isOverLimit: !isUnlimited && limit > 0 && used >= limit,
        isApproachingLimit: !isUnlimited && limit > 0 && pct >= 80,
        mode: (data.mode as any) || "monthly",
        dailyUsed, dailyLimit, dailyPct, isDailyUnlimited,
        isDailyOverLimit: !isDailyUnlimited && dailyLimit > 0 && dailyUsed >= dailyLimit,
        isDailyApproachingLimit: !isDailyUnlimited && dailyLimit > 0 && dailyPct >= 80,
        extraPurchased: Number(data.extra_purchased || 0),
      };
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return query.data || EMPTY;
};
