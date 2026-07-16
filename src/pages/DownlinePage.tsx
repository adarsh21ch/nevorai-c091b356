import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAccess } from "@/hooks/useEffectiveAccess";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Trash2, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DownlineMember {
  id: string;
  member_id: string | null;
  invite_email: string | null;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
}

export default function DownlinePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { access } = useEffectiveAccess();
  const { config } = usePlanLimits();
  const [email, setEmail] = useState("");

  const isLeader = access?.plan_slug === "leader";
  const maxSeats = (config as any)?.max_team_members ?? 0;

  const membersQ = useQuery({
    queryKey: ["downline-members", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_members")
        .select("id, member_id, invite_email, status, invited_at, accepted_at")
        .eq("leader_id", user!.id)
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DownlineMember[];
    },
  });

  const members = membersQ.data ?? [];
  const isUnlimited = maxSeats === -1;
  const seatsUsed = members.length;
  const canInvite = isLeader && (isUnlimited || seatsUsed < maxSeats);

  const inviteMut = useMutation({
    mutationFn: async (invite_email: string) => {
      const clean = invite_email.trim().toLowerCase();
      if (!clean || !/^\S+@\S+\.\S+$/.test(clean)) throw new Error("Enter a valid email");
      const { error } = await (supabase as any).from("team_members").insert({
        leader_id: user!.id,
        invite_email: clean,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation added — share your leader link with them");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["downline-members", user?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to invite"),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from downline");
      qc.invalidateQueries({ queryKey: ["downline-members", user?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  return (
    <DashboardLayout>
      <div className="container-app py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> My Downline
          </h1>
          <p className="text-sm text-muted-foreground">
            Sub-members inherit your Leader plan access (Starter-level features) while your subscription is active.
          </p>
        </div>

        {!isLeader && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Crown className="h-4 w-4 text-amber-500" /> Leader plan required
              </CardTitle>
              <CardDescription>
                Upgrade to the Leader plan to invite sub-members into your downline.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isLeader && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" /> Invite a downline member
              </CardTitle>
              <CardDescription>
                {isUnlimited
                  ? `Unlimited seats · ${seatsUsed} added`
                  : `${seatsUsed} of ${maxSeats} seats used`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex gap-2 flex-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canInvite) {
                    toast.error("All seats are used. Remove someone or upgrade.");
                    return;
                  }
                  inviteMut.mutate(email);
                }}
              >
                <Input
                  type="email"
                  placeholder="member@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 min-w-[220px]"
                  disabled={!canInvite || inviteMut.isPending}
                />
                <Button type="submit" disabled={!canInvite || inviteMut.isPending}>
                  {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Downline members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {membersQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No downline members yet. {isLeader ? "Invite someone above." : "Upgrade to Leader to start building your downline."}
              </p>
            ) : (
              <ul className="divide-y">
                {members.map((m) => (
                  <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {m.invite_email ?? m.member_id ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.status === "active" && m.accepted_at
                          ? `Joined ${new Date(m.accepted_at).toLocaleDateString()}`
                          : `Invited ${m.invited_at ? new Date(m.invited_at).toLocaleDateString() : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={m.status === "active" ? "default" : "secondary"}>
                        {m.status}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Remove this member from your downline?")) removeMut.mutate(m.id);
                        }}
                        disabled={removeMut.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
