// Phase 4 — Workspace memberships hook.
// Returns the list of workspaces the signed-in user belongs to.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WorkspaceMembership = {
  workspace_id: string;
  role: "owner" | "admin" | "member" | string;
  slug: string;
  name: string;
  plan: string;
  status: string;
};

export function useWorkspaces() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-workspaces", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceMembership[]> => {
      const { data, error } = await (supabase as any)
        .from("tenant_members")
        .select("role, workspace_id:tenant_id, workspaces:tenants!inner(id, slug, name, plan, status, deleted_at)")
        .eq("user_id", user!.id);
      if (error) {
        console.warn("[useWorkspaces] load failed:", error.message);
        return [];
      }
      const LEGACY_WORKSPACE_ID = "772d6de4-34d2-458a-9a1b-604cbbcf02f7";
      return (data ?? [])
        .filter((row: any) => row.workspaces && !row.workspaces.deleted_at)
        // Hide the shared "Nevorai (Legacy)" workspace from the switcher for
        // non-owner members. 345 users are members of this workspace; letting
        // any of them select it would expose content across all members.
        .filter((row: any) => {
          const isLegacy =
            row.workspaces?.slug === "legacy" ||
            row.workspace_id === LEGACY_WORKSPACE_ID;
          return !isLegacy || row.role === "owner";
        })
        .map((row: any): WorkspaceMembership => ({
          workspace_id: row.workspace_id,
          role: row.role,
          slug: row.workspaces.slug,
          name: row.workspaces.name,
          plan: row.workspaces.plan,
          status: row.workspaces.status,
        }))
        .sort((a: WorkspaceMembership, b: WorkspaceMembership) => {
          // owner/admin first, then alpha by name
          const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
          const d = rank(a.role) - rank(b.role);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        });
    },
  });
}
