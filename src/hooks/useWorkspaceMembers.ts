// Phase 6 — Workspace members + invitations.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMember = {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member" | string;
  created_at: string;
};

export type WorkspaceInvitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export function useWorkspaceMembers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const { data, error } = await (supabase as any).rpc("list_workspace_members", { _ws: workspaceId });
      if (error) throw error;
      return (data ?? []) as WorkspaceMember[];
    },
  });
}

export function useWorkspaceInvitations(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["workspace-invitations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceInvitation[]> => {
      const { data, error } = await (supabase as any).rpc("list_workspace_invitations", { _ws: workspaceId });
      if (error) throw error;
      return (data ?? []) as WorkspaceInvitation[];
    },
  });
}

export function useInviteMember(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!workspaceId) throw new Error("no workspace");
      const { data, error } = await (supabase as any).rpc("create_workspace_invitation", {
        _ws: workspaceId, _email: email, _role: role,
      });
      if (error) throw error;
      return data as WorkspaceInvitation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-invitations", workspaceId] }),
  });
}

export function useRevokeInvitation(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("revoke_workspace_invitation", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-invitations", workspaceId] }),
  });
}

export function useRemoveMember(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceId) throw new Error("no workspace");
      const { error } = await (supabase as any).rpc("remove_workspace_member", {
        _ws: workspaceId, _user: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      qc.invalidateQueries({ queryKey: ["my-workspaces"] });
    },
  });
}

export function useUpdateMemberRole(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      if (!workspaceId) throw new Error("no workspace");
      const { error } = await (supabase as any).rpc("update_workspace_member_role", {
        _ws: workspaceId, _user: userId, _role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-members", workspaceId] }),
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await (supabase as any).rpc("accept_workspace_invitation", { _token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-workspaces"] });
    },
  });
}
