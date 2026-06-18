import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { brand as BRAND } from "@/config/brand";

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location.origin) || `https://${BRAND.domain}`;

type Link = {
  funnel_id: string;
  funnel_title: string;
  funnel_slug: string;
  share_token: string;
  link_active: boolean | null;
};

type Leader = { upline_id: string; leader_name: string | null } | null;

export function PromoteSection() {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string>("");

  const { data: leader } = useQuery<Leader>({
    queryKey: ["my-leader", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_leader");
      if (error) throw error;
      return (data as Leader) ?? null;
    },
  });

  const { data: links = [] } = useQuery<Link[]>({
    queryKey: ["my-promote-links", user?.id],
    enabled: !!user?.id && !!leader,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_member_links")
        .select("funnel_id, funnel_title, funnel_slug, share_token, link_active")
        .eq("member_id", user!.id)
        .eq("link_active", true);
      if (error) throw error;
      return (data ?? []) as Link[];
    },
  });

  if (!leader || links.length === 0) return null;

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Copied!");
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  const shareWa = (title: string, url: string) => {
    const text = `Check this out → ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" />
          Promote {leader.leader_name ? `${leader.leader_name}'s` : "your leader's"} funnels
        </CardTitle>
        <CardDescription>
          Your personal share links. Every view and lead gets attributed to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.map((l) => {
          const url = `${SITE_ORIGIN}/f/${l.funnel_slug}?t=${l.share_token}`;
          return (
            <div
              key={l.funnel_id}
              className="rounded-lg border bg-card p-3 space-y-2"
            >
              <p className="font-medium text-sm">{l.funnel_title}</p>
              <p className="font-mono text-xs break-all text-muted-foreground">{url}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] flex-1"
                  onClick={() => handleCopy(l.funnel_id, url)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  {copiedId === l.funnel_id ? "Copied!" : "Copy"}
                </Button>
                <Button
                  size="sm"
                  className="min-h-[44px] flex-1"
                  onClick={() => shareWa(l.funnel_title, url)}
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  WhatsApp
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
