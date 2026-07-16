// Per-plan view limits removed from product — hook returns unlimited.

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

const UNLIMITED: MonthlyViewsStats = {
  used: 0, limit: -1, planKey: "unlimited", resetAt: new Date().toISOString(),
  pct: 0, isUnlimited: true, isOverLimit: false, isApproachingLimit: false,
  mode: "monthly", dailyUsed: 0, dailyLimit: -1, dailyPct: 0,
  isDailyUnlimited: true, isDailyOverLimit: false, isDailyApproachingLimit: false,
  extraPurchased: 0,
};

/**
 * Per-plan view limits were removed from the product.
 * This hook always reports "unlimited"; view tracking still happens elsewhere.
 */
export const useMonthlyViews = () => UNLIMITED;
