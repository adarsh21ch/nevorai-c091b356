// Phase 5 — Workspace branding hook.
// Reads + writes per-workspace branding (app name, logo, colors, favicon).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceBranding = {
  workspace_id: string;
  app_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  theme_color: string | null;
  email_from_name: string | null;
};

const EMPTY = (workspace_id: string): WorkspaceBranding => ({
  workspace_id,
  app_name: null,
  logo_url: null,
  favicon_url: null,
  primary_color: null,
  secondary_color: null,
  theme_color: null,
  email_from_name: null,
});

export function useWorkspaceBranding(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["workspace-branding", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceBranding> => {
      const { data, error } = await (supabase as any)
        .from("workspace_branding")
        .select("workspace_id, app_name, logo_url, favicon_url, primary_color, secondary_color, theme_color, email_from_name")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) {
        console.warn("[useWorkspaceBranding] load failed:", error.message);
        return EMPTY(workspaceId!);
      }
      return (data as WorkspaceBranding | null) ?? EMPTY(workspaceId!);
    },
  });
}

export function useUpdateWorkspaceBranding(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<WorkspaceBranding, "workspace_id">>) => {
      if (!workspaceId) throw new Error("No active workspace");
      const { error } = await (supabase as any)
        .from("workspace_branding")
        .upsert({ workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-branding", workspaceId] });
    },
  });
}
