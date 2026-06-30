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
        .from("workspace_members")
        .select("role, workspace_id, workspaces!inner(id, slug, name, plan, status, deleted_at)")
        .eq("user_id", user!.id);
      if (error) {
        console.warn("[useWorkspaces] load failed:", error.message);
        return [];
      }
      return (data ?? [])
        .filter((row: any) => row.workspaces && !row.workspaces.deleted_at)
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
