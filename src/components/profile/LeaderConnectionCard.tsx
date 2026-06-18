import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link2, UserCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConnectLeaderModal } from "./ConnectLeaderModal";

type LeaderInfo = {
  upline_id: string;
  leader_name: string | null;
  leader_avatar: string | null;
  connected_at: string;
  source: string | null;
} | null;

function sourceLabel(src: string | null): string {
  switch (src) {
    case "qr_scan":
      return "via QR Scan";
    case "upload_qr":
      return "via Upload";
    case "paste_link":
    case "connect_link":
      return "via Link";
    default:
      return src ? `via ${src}` : "";
  }
}

export function LeaderConnectionCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: leader, isLoading } = useQuery<LeaderInfo>({
    queryKey: ["my-leader", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_leader");
      if (error) throw error;
      return (data as LeaderInfo) ?? null;
    },
  });

  if (!user || isLoading) return null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my-leader"] });
    qc.invalidateQueries({ queryKey: ["my-team-members"] });
    qc.invalidateQueries({ queryKey: ["team-member-links"] });
    qc.invalidateQueries({ queryKey: ["my-promote-links"] });
  };

  const handleDisconnect = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("disconnect_from_leader");
    setBusy(false);
    setConfirmOpen(false);
    if (error) {
      toast.error(error.message || "Could not disconnect");
      return;
    }
    toast.success("Disconnected from your leader");
    invalidateAll();
  };

  return (
    <>
      <div className="px-4 py-3 rounded-lg bg-muted/40 border border-border">
        {leader ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {leader.leader_avatar ? (
                <img src={leader.leader_avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Connected to your leader</p>
              <p className="text-sm font-medium truncate">
                {leader.leader_name || "Your leader"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Since {new Date(leader.connected_at).toLocaleDateString()}
                {leader.source ? (
                  <Badge variant="secondary" className="ml-2 text-[10px] py-0">
                    {sourceLabel(leader.source)}
                  </Badge>
                ) : null}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Link2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Connect with your leader</p>
              <p className="text-xs text-muted-foreground">
                Paste their link, scan or upload their QR.
              </p>
            </div>
            <Button size="sm" onClick={() => setOpen(true)}>Connect</Button>
          </div>
        )}
      </div>

      <ConnectLeaderModal
        open={open}
        onOpenChange={setOpen}
        onConnected={() => invalidateAll()}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect from your leader?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll lose your personal share links for their funnels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
