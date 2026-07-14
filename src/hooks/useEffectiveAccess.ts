import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type EffectiveAccessState = "active" | "trial" | "grace" | "blocked";
export type EffectiveAccessSource = "self" | "trial" | "team" | "none";

export interface EffectiveAccess {
  state: EffectiveAccessState;
  source: EffectiveAccessSource;
  plan_slug: string | null;
  leader_id: string | null;
  expires_at: string | null;
  grace_ends_at: string | null;
}

/**
 * Single source of truth for the current user's effective plan access.
 *
 * Wraps the `get_effective_access(uuid)` RPC (see leader_plan_foundation_migration.sql).
 * Resolves, in order: self-paid → self-grace → inherited from a Leader → trial → blocked.
 * Inherited access is capped at Starter-level features.
 */
export const useEffectiveAccess = () => {
  const { user } = useAuth();
  const query = useQuery<EffectiveAccess | null>({
    queryKey: ["effective-access", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase as any).rpc("get_effective_access", {
        _user: user.id,
      });
      if (error) {
        console.warn("[useEffectiveAccess] rpc failed:", error.message);
        return null;
      }
      return data as EffectiveAccess;
    },
  });

  return {
    access: query.data ?? null,
    isLoading: query.isLoading,
    isBlocked: query.data?.state === "blocked",
    isTrial: query.data?.state === "trial",
    isGrace: query.data?.state === "grace",
    isActive: query.data?.state === "active" || query.data?.state === "trial",
    isInherited: query.data?.source === "team",
    planSlug: query.data?.plan_slug ?? null,
    refetch: query.refetch,
  };
};
