import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Bucket = { views: number; leads: number };

function startOf(kind: "today" | "yesterday" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "today") return d;
  if (kind === "yesterday") {
    const y = new Date(d);
    y.setDate(d.getDate() - 1);
    return y;
  }
  if (kind === "week") {
    const w = new Date(d);
    w.setDate(d.getDate() - 6);
    return w;
  }
  const m = new Date(d);
  m.setDate(d.getDate() - 29);
  return m;
}

function endOf(kind: "today" | "yesterday" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "yesterday") return d;
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  return t;
}

export const TodaysNumbers = () => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["todays-numbers", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: videos } = await supabase
        .from("video_assets")
        .select("id")
        .eq("owner_id", user!.id);
      const videoIds = (videos || []).map((v: any) => v.id);

      const { data: funnels } = await supabase
        .from("funnels")
        .select("id")
        .eq("owner_id", user!.id);
      const funnelIds = (funnels || []).map((f: any) => f.id);

      const monthStart = startOf("month").toISOString();

      let events: any[] = [];
      if (videoIds.length) {
        const { data } = await (supabase as any)
          .from("video_view_events")
          .select("started_at, visitor_fingerprint, ip_ua_hash, session_id, video_id")
          .in("video_id", videoIds)
          .gte("started_at", monthStart)
          .limit(20000);
        events = data || [];
      }

      let leads: any[] = [];
      if (funnelIds.length) {
        const { data } = await supabase
          .from("funnel_leads")
          .select("submitted_at, id")
          .in("funnel_id", funnelIds)
          .gte("submitted_at", monthStart)
          .limit(20000);
        leads = data || [];
      }

      const bucket = (label: "today" | "yesterday" | "week" | "month"): Bucket => {
        const from = startOf(label).getTime();
        const to = endOf(label).getTime();
        const fps = new Set<string>();
        for (const e of events) {
          const t = new Date(e.started_at).getTime();
          if (t >= from && t < to) fps.add(e.visitor_fingerprint || e.ip_ua_hash || e.session_id);
        }
        let l = 0;
        for (const r of leads) {
          const t = new Date(r.submitted_at).getTime();
          if (t >= from && t < to) l++;
        }
        return { views: fps.size, leads: l };
      };

      return {
        today: bucket("today"),
        yesterday: bucket("yesterday"),
        week: bucket("week"),
        month: bucket("month"),
      };
    },
  });

  const tiles: [string, Bucket | undefined][] = [
    ["Today", data?.today],
    ["Yesterday", data?.yesterday],
    ["This week", data?.week],
    ["This month", data?.month],
  ];

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-heading font-semibold">Today's numbers</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, b]) => (
          <div key={label} className="rounded-xl border border-border bg-background/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-heading font-bold tabular-nums">
              {b?.views ?? 0}
              <span className="text-muted-foreground"> / </span>
              {b?.leads ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground">viewers / leads</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TodaysNumbers;
