import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, MessageCircle, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { waLink, telLink } from "@/lib/followUp";

type Row = {
  sessionId: string;
  viewerName: string;
  funnelTitle: string;
  progress: number;
  when: string;
  phone: string | null;
};

export const LiveViewersBar = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: rows = [] } = useQuery<Row[]>({
    queryKey: ["live-viewers", user?.id],
    enabled: !!user,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: funnels } = await supabase
        .from("funnels")
        .select("id, title")
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
      for (const e of events || []) if (!bySession.has(e.session_id)) bySession.set(e.session_id, e);
      const top = Array.from(bySession.values()).slice(0, 8);
      const leadIds = top.map((t) => t.lead_id).filter(Boolean) as string[];
      let leads: Record<string, { name: string; phone: string | null }> = {};
      if (leadIds.length) {
        const { data: leadRows } = await supabase
          .from("funnel_leads")
          .select("id, name, phone")
          .in("id", leadIds);
        leads = Object.fromEntries(
          (leadRows || []).map((l: any) => [l.id, { name: l.name || "Anonymous", phone: l.phone }]),
        );
      }
      const fm = Object.fromEntries((funnels || []).map((f: any) => [f.id, f]));
      return top.map((e: any) => ({
        sessionId: e.session_id,
        viewerName: e.lead_id ? leads[e.lead_id]?.name || "Anonymous" : "Anonymous viewer",
        funnelTitle: fm[e.funnel_id]?.title || "Your funnel",
        progress: Math.max(0, Math.min(100, Math.round(e.progress_percent || 0))),
        when: e.recorded_at as string,
        phone: e.lead_id ? leads[e.lead_id]?.phone ?? null : null,
      }));
    },
  });

  const count = rows.length;

  if (count === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        No one watching right now — share a link.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-emerald-500/8"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {count} {count === 1 ? "person" : "people"} watching right now
        </span>
        <ChevronDown
          size={16}
          className={`ml-auto text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-emerald-500/15 border-t border-emerald-500/15">
          {rows.map((v) => {
            const wa = waLink(v.phone, v.funnelTitle);
            const tel = telLink(v.phone);
            return (
              <li key={v.sessionId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.viewerName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.funnelTitle} · {formatDistanceToNow(new Date(v.when), { addSuffix: true })}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${v.progress}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{v.progress}%</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                      aria-label="WhatsApp"
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                  {tel && (
                    <a
                      href={tel}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background hover:bg-muted"
                      aria-label="Call"
                    >
                      <Phone size={16} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LiveViewersBar;
