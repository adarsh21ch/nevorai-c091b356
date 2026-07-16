import { useEffectiveAccess } from "@/hooks/useEffectiveAccess";

export type AccessState = "active" | "grace" | "blocked";

export interface AccessStateResult {
  state: AccessState;
  graceEndsAt: Date | null;
  isLoading: boolean;
  /** @deprecated free-access admin toggle removed — always true. */
  freeAccessEnabled: boolean;
}

/**
 * Thin wrapper over `useEffectiveAccess` (backed by the `get_effective_access`
 * SECURITY DEFINER RPC) that maps the four-state result down to the three
 * states the creator dashboard banner cares about. `trial` counts as active.
 */
export const useAccessState = (): AccessStateResult => {
  const { access, isLoading } = useEffectiveAccess();

  if (isLoading || !access) {
    return { state: "active", graceEndsAt: null, isLoading, freeAccessEnabled: true };
  }

  const graceEndsAt = access.grace_ends_at ? new Date(access.grace_ends_at) : null;

  if (access.state === "grace") {
    return { state: "grace", graceEndsAt, isLoading: false, freeAccessEnabled: true };
  }
  if (access.state === "blocked") {
    return { state: "blocked", graceEndsAt, isLoading: false, freeAccessEnabled: true };
  }
  return { state: "active", graceEndsAt: null, isLoading: false, freeAccessEnabled: true };
};
