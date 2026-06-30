// Phase 6 — Workspace settings hooks (rename + slug change).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, name }: { workspaceId: string; name: string }) => {
      const { error } = await (supabase as any).rpc("rename_workspace", { _ws: workspaceId, _name: name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workspaces"] }),
  });
}

export function useChangeWorkspaceSlug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, slug }: { workspaceId: string; slug: string }) => {
      const { error } = await (supabase as any).rpc("change_workspace_slug", { _ws: workspaceId, _new_slug: slug });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workspaces"] }),
  });
}
