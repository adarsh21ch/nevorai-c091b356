import { Link, useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const WatchingNowStrip = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: liveViewers = [] } = useQuery({
    queryKey: ["watching-now", user?.id],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data: funnels } = await supabase
        .from("funnels")
        .select("id, title, slug")
        .eq("owner_id", user!.id);
      const ids = (funnels || []).map((f) => f.id);
      if (!ids.length) return [];
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: events } = await supabase
        .from("funnel_video_analytics")
        .select("session_id, funnel_id, lead_id, progress_percent, recorded_at")
        .in("funnel_id", ids)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(50);

      const bySession = new Map<string, any>();
      for (const e of events || []) {
        if (!bySession.has(e.session_id)) bySession.set(e.session_id, e);
      }
      const top = Array.from(bySession.values()).slice(0, 3);
      const leadIds = top.map((t) => t.lead_id).filter(Boolean) as string[];
      let leads: Record<string, { name: string }> = {};
      if (leadIds.length) {
        const { data: leadRows } = await supabase
          .from("funnel_leads")
          .select("id, name")
          .in("id", leadIds);
        leads = Object.fromEntries((leadRows || []).map((l: any) => [l.id, { name: l.name || "Anonymous" }]));
      }
      const funnelMap = Object.fromEntries((funnels || []).map((f: any) => [f.id, f]));
      return top.map((e: any) => ({
        sessionId: e.session_id,
        viewerName: e.lead_id ? leads[e.lead_id]?.name || "Anonymous" : "Anonymous viewer",
        funnelTitle: funnelMap[e.funnel_id]?.title || "Your funnel",
        funnelSlug: funnelMap[e.funnel_id]?.slug,
        progress: Math.max(0, Math.min(100, Math.round(e.progress_percent || 0))),
        when: e.recorded_at as string,
      }));
    },
  });

  // Empty state — slim one-liner, no wasted vertical space
  if (liveViewers.length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate("/insights")}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-4 py-2.5 text-left transition hover:bg-card"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/40" />
          </span>
          <span className="truncate text-xs text-muted-foreground">
            No one watching right now · share a link to go live
          </span>
        </div>
        <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-sm font-heading font-semibold">
            Watching now · {liveViewers.length}
          </h2>
        </div>
        <Link to="/insights" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Activity <ArrowRight size={12} />
        </Link>
      </div>

      <ul className="space-y-2">
        {liveViewers.map((v) => (
          <li
            key={v.sessionId}
            className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.viewerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.funnelTitle} · {formatDistanceToNow(new Date(v.when), { addSuffix: true })}
              </p>
            </div>
            <div className="w-20 shrink-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${v.progress}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{v.progress}%</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WatchingNowStrip;
