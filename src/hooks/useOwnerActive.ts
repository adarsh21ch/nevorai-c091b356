import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the OWNER of a public resource (funnel, video, landing page)
 * has an active plan. If false, the public viewer should render
 * <PlanInactiveScreen /> instead of the resource.
 *
 * Backed by SECURITY DEFINER RPC `is_owner_plan_active(uuid)` — safe for anon.
 *
 * While `isLoading` is true, callers should render nothing / a spinner rather
 * than the blocked screen, to avoid a flash for legitimate paid creators.
 */
export const useOwnerActive = (ownerId: string | null | undefined) => {
  const { data, isLoading } = useQuery({
    queryKey: ["is_owner_plan_active", ownerId],
    queryFn: async () => {
      if (!ownerId) return true;
      const { data, error } = await (supabase as any).rpc("is_owner_plan_active", { _owner: ownerId });
      if (error) {
        // Fail-open: if the RPC is missing or errors, don't block legitimate users.
        console.warn("[useOwnerActive] rpc failed, defaulting to active:", error.message);
        return true;
      }
      return !!data;
    },
    enabled: !!ownerId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return { isActive: data !== false, isChecking: isLoading };
};
