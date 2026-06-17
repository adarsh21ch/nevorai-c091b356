import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link2, UserCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { ConnectLeaderModal } from "./ConnectLeaderModal";

type LeaderInfo = { id: string; full_name: string | null; email: string | null; avatar_url: string | null };

export function LeaderConnectionCard() {
  const { user } = useAuth();
  const [leader, setLeader] = useState<LeaderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: conn } = await (supabase as any)
      .from("team_connections")
      .select("upline_id")
      .eq("member_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (conn?.upline_id) {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", conn.upline_id)
        .maybeSingle();
      setLeader(prof || null);
    } else {
      setLeader(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || !user) return null;

  return (
    <>
      <div className="px-4 py-3 rounded-lg bg-muted/40 border border-border">
        {leader ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {leader.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={leader.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Connected to your leader</p>
              <p className="text-sm font-medium truncate">
                {leader.full_name || leader.email || "Your leader"}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/team"><ExternalLink className="h-4 w-4" /></Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
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
        onConnected={() => void load()}
      />
    </>
  );
}
