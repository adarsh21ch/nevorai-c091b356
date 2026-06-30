// Public hook for reading the current resolved workspace tenant.
// In Phase 0 this only powers diagnostics; later phases use it for branding,
// dynamic manifest, and workspace-scoped Supabase queries.
import { useTenantContext } from "@/contexts/TenantProvider";
import type { ResolvedTenant } from "@/lib/tenant.functions";

export function useTenant(): {
  tenant: ResolvedTenant | null;
  isLegacy: boolean;
  workspaceId: string | null;
} {
  const { tenant, isLegacy } = useTenantContext();
  return {
    tenant,
    isLegacy,
    workspaceId: tenant?.workspace_id ?? null,
  };
}
