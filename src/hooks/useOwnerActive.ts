import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the OWNER of a public resource (funnel, video, landing page)
 * has effective plan access. If false, the public viewer should render
 * <PlanInactiveScreen /> instead of the resource.
 *
 * Preferred backend: `get_effective_access(uuid)` — resolves self / trial /
 * inherited-from-leader / grace / blocked in a single SECURITY DEFINER RPC.
 * Falls back to legacy `is_owner_plan_active(uuid)` when the newer RPC is
 * unavailable so old deployments keep working. Fails open on error.
 */
export const useOwnerActive = (ownerId: string | null | undefined) => {
  const { data, isLoading } = useQuery({
    queryKey: ["is_owner_plan_active", ownerId],
    queryFn: async () => {
      if (!ownerId) return true;
      const eff = await (supabase as any).rpc("get_effective_access", { _user: ownerId });
      if (!eff.error && eff.data) {
        const state = (eff.data as any).state as string | undefined;
        return state ? state !== "blocked" : true;
      }
      const legacy = await (supabase as any).rpc("is_owner_plan_active", { _owner: ownerId });
      if (legacy.error) {
        console.warn("[useOwnerActive] both RPCs failed, defaulting to active:", legacy.error.message);
        return true;
      }
      return !!legacy.data;
    },
    enabled: !!ownerId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return { isActive: data !== false, isChecking: isLoading };
};
