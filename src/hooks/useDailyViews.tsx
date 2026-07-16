/**
 * Per-plan view limits were removed from the product.
 * This hook now always reports "unlimited" so no UI shows a quota bar
 * or blocks a prospect. View tracking itself still happens elsewhere.
 */
export const useDailyViews = () => {
  return {
    used: 0,
    limit: -1,
    isUnlimited: true,
    percent: 0,
    status: "ok" as "ok" | "warning" | "limit",
    hasCustomOverride: false,
  };
};
