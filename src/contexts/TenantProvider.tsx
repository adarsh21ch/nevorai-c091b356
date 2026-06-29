// =============================================================================
// TenantProvider — Phase 0
// =============================================================================
// Resolves the current workspace from the incoming Host (server-side via the
// loader in __root.tsx) and exposes it to the entire app via useTenant().
//
// In Phase 0 this is informational ONLY — nothing reads workspace_id off it
// yet. Phase 1 will wire it into the Supabase client wrapper so queries
// carry the workspace GUC into Postgres.
// =============================================================================
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ResolvedTenant } from "@/lib/tenant.functions";

type TenantContextValue = {
  tenant: ResolvedTenant | null;
  isLegacy: boolean;
};

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  isLegacy: true,
});

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: ResolvedTenant | null;
  children: ReactNode;
}) {
  const value = useMemo<TenantContextValue>(
    () => ({ tenant, isLegacy: !tenant || tenant.is_legacy }),
    [tenant],
  );
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext(): TenantContextValue {
  return useContext(TenantContext);
}
