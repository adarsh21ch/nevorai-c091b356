import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Phone, Flame, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { waLink, telLink, heatOf, formatDropoff } from "@/lib/followUp";

type Row = {
  sessionId: string;
  name: string;
  phone: string | null;
  funnelTitle: string;
  progress: number;
  maxSeconds: number;
  when: string;
  ctaClicked: boolean;
};

export const FollowUpToday = () => {
  const { user } = useAuth();

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["followup-today", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: funnels } = await supabase
        .from("funnels")
        .select("id, title")
        .eq("owner_id", user!.id);
      const ids = (funnels || []).map((f) => f.id);
      if (!ids.length) return [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase
        .from("funnel_video_analytics")
        .select("session_id, funnel_id, lead_id, progress_percent, watch_seconds, event_type, recorded_at")
        .in("funnel_id", ids)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(500);

      // reduce per session: best progress, latest ts, cta click if any
      const bySession = new Map<string, any>();
      for (const e of events || []) {
        const cur = bySession.get(e.session_id);
        const cta = /cta|click/i.test(e.event_type || "");
        if (!cur) {
          bySession.set(e.session_id, {
            ...e,
            best: e.progress_percent || 0,
            best_seconds: e.watch_seconds || 0,
            cta,
            latest: e.recorded_at,
          });
        } else {
          cur.best = Math.max(cur.best, e.progress_percent || 0);
          cur.best_seconds = Math.max(cur.best_seconds, e.watch_seconds || 0);
          cur.cta = cur.cta || cta;
          if (e.recorded_at > cur.latest) cur.latest = e.recorded_at;
        }
      }
      const items = Array.from(bySession.values());
      const leadIds = items.map((i) => i.lead_id).filter(Boolean) as string[];
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

      const mapped: Row[] = items.map((i) => ({
        sessionId: i.session_id,
        name: i.lead_id ? leads[i.lead_id]?.name || "Anonymous" : "Anonymous viewer",
        phone: i.lead_id ? leads[i.lead_id]?.phone ?? null : null,
        funnelTitle: fm[i.funnel_id]?.title || "Your funnel",
        progress: Math.max(0, Math.min(100, Math.round(i.best || 0))),
        maxSeconds: Math.floor(i.best_seconds || 0),
        when: i.latest,
        ctaClicked: i.cta,
      }));

      // sort: cta first, then progress desc, then recency
      mapped.sort((a, b) => {
        const s = Number(b.ctaClicked) - Number(a.ctaClicked);
        if (s) return s;
        if (b.progress !== a.progress) return b.progress - a.progress;
        return b.when.localeCompare(a.when);
      });
      return mapped.slice(0, 10);
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-heading font-semibold">Follow up today</h2>
        <span className="text-xs text-muted-foreground">{rows.length ? `${rows.length} viewers` : ""}</span>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-muted/30 p-5 text-center">
          <p className="text-sm font-medium">No follow-ups yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            Share a video link — jisne dekha, wo yahan dikhega.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const heat = heatOf(r.progress, r.ctaClicked);
            const wa = waLink(r.phone, r.funnelTitle);
            const tel = telLink(r.phone);
            return (
              <li
                key={r.sessionId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-background/40 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    {heat === "hot" && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold text-orange-500">
                        <Flame size={10} /> HOT
                      </span>
                    )}
                    {heat === "warm" && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-500">
                        <Zap size={10} /> WARM
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.funnelTitle} · {r.progress}% watched · stopped at {formatDropoff(r.maxSeconds)} ·{" "}
                    {formatDistanceToNow(new Date(r.when), { addSuffix: true })}
                  </p>
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
                  {!wa && !tel && <span className="text-[10px] text-muted-foreground">No contact</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default FollowUpToday;
