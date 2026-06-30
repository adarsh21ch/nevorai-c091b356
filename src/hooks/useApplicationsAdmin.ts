// Admin-only RPC hooks for the Applications panel.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminApplication = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  allow_team_management: boolean;
  created_at: string;
  deleted_at: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
};

export type AdminUserPick = {
  id: string;
  email: string;
  full_name: string;
  username: string;
};

export function useAdminApplications() {
  return useQuery({
    queryKey: ["admin-applications"],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminApplication[]> => {
      const { data, error } = await (supabase as any).rpc("admin_list_applications");
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminApplication[];
    },
  });
}

export function useAdminSearchUsers(q: string) {
  return useQuery({
    queryKey: ["admin-search-users", q],
    enabled: true,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminUserPick[]> => {
      const { data, error } = await (supabase as any).rpc("admin_search_users", {
        _q: q ?? "",
        _limit: 20,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminUserPick[];
    },
  });
}

export function useAdminCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      name: string;
      slug: string;
      owner_id: string;
      plan?: "free" | "basic" | "pro";
      allow_team?: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc("admin_create_application", {
        _name: args.name,
        _slug: args.slug,
        _owner_id: args.owner_id,
        _plan: args.plan ?? "free",
        _allow_team: args.allow_team ?? false,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-applications"] }),
  });
}

export function useAdminUpdateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      name?: string;
      slug?: string;
      plan?: string;
      status?: string;
      allow_team?: boolean;
    }) => {
      const { error } = await (supabase as any).rpc("admin_update_application", {
        _ws: args.id,
        _name: args.name ?? null,
        _slug: args.slug ?? null,
        _plan: args.plan ?? null,
        _status: args.status ?? null,
        _allow_team: args.allow_team ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-applications"] }),
  });
}

export function useAdminDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("admin_delete_application", { _ws: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-applications"] }),
  });
}

export function useAdminTransferApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; new_owner_id: string }) => {
      const { error } = await (supabase as any).rpc("admin_transfer_application", {
        _ws: args.id,
        _new_owner: args.new_owner_id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-applications"] }),
  });
}
