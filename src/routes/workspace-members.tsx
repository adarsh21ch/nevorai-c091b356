import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import {
  useWorkspaceMembers, useWorkspaceInvitations, useInviteMember,
  useRevokeInvitation, useRemoveMember, useUpdateMemberRole,
} from "@/hooks/useWorkspaceMembers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/workspace-members")({
  head: () => ({ meta: [{ title: "Workspace members" }] }),
  component: WorkspaceMembersPage,
});

function WorkspaceMembersPage() {
  const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
  const { data: members = [], isLoading } = useWorkspaceMembers(activeWorkspaceId);
  const { data: invitations = [] } = useWorkspaceInvitations(activeWorkspaceId);
  const invite = useInviteMember(activeWorkspaceId);
  const revoke = useRevokeInvitation(activeWorkspaceId);
  const remove = useRemoveMember(activeWorkspaceId);
  const setRole = useUpdateMemberRole(activeWorkspaceId);

  const isOwner = activeWorkspace?.role === "owner";
  const canManage = isOwner || activeWorkspace?.role === "admin";

  const [email, setEmail] = useState("");
  const [role, setRoleVal] = useState("member");

  const handleInvite = async () => {
    try {
      const inv = await invite.mutateAsync({ email, role });
      const link = `${window.location.origin}/workspace-invite/${inv.token}`;
      await navigator.clipboard?.writeText(link).catch(() => {});
      toast.success("Invitation created — link copied to clipboard");
      setEmail("");
    } catch (e: any) { toast.error(e?.message || "Invite failed"); }
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/workspace-invite/${token}`;
    await navigator.clipboard?.writeText(link).catch(() => {});
    toast.success("Link copied");
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace members</h1>
          <p className="text-sm text-muted-foreground">
            Invite teammates to <span className="font-medium">{activeWorkspace?.name ?? "this workspace"}</span> and manage their access.
          </p>
        </div>

        {canManage && (
          <Card className="space-y-3 p-6">
            <h2 className="font-semibold">Invite a member</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" />
              </div>
              <div className="w-full sm:w-40 space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRoleVal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? "Creating…" : "Create invite"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We'll generate a link you can share. The invitee must sign in with the same email to accept.
            </p>
          </Card>
        )}

        <Card className="p-6">
          <h2 className="mb-3 font-semibold">Members ({members.length})</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.role}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner && (
                      <Select value={m.role} onValueChange={(v) => setRole.mutate({ userId: m.user_id, role: v })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => {
                          if (!confirm(`Remove ${m.email}?`)) return;
                          remove.mutate(m.user_id, {
                            onSuccess: () => toast.success("Member removed"),
                            onError: (e: any) => toast.error(e?.message || "Remove failed"),
                          });
                        }}
                      ><Trash2 size={16} /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {canManage && invitations.length > 0 && (
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Pending invitations ({invitations.length})</h2>
            <div className="divide-y divide-border">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => copyLink(inv.token)}><Copy size={16} /></Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => revoke.mutate(inv.id, {
                        onSuccess: () => toast.success("Invitation revoked"),
                        onError: (e: any) => toast.error(e?.message || "Revoke failed"),
                      })}
                    ><Trash2 size={16} /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
