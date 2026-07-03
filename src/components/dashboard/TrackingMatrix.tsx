import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Video as VideoIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { watchedPercent, formatDropoff } from "@/lib/followUp";

const DAYS = 30;

function dayKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): { key: string; label: string; date: Date }[] {
  const out: { key: string; label: string; date: Date }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      date: d,
    });
  }
  return out;
}

type Video = { id: string; title: string; thumbnail_url: string | null };
type EventRow = {
  video_id: string;
  session_id: string;
  visitor_fingerprint: string | null;
  ip_ua_hash: string | null;
  started_at: string;
  watch_position_seconds: number | null;
  max_position_seconds: number | null;
  duration_seconds: number | null;
  source_type: string | null;
};

export const TrackingMatrix = () => {
  const { user } = useAuth();
  const [drill, setDrill] = useState<{ video: Video; dayKey: string; label: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "watched50" | "cta">("all");

  const { data: videos = [] } = useQuery<Video[]>({
    queryKey: ["matrix-videos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("video_assets")
        .select("id, title, thumbnail_url")
        .eq("owner_id", user!.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  const videoIds = videos.map((v) => v.id);

  const { data: events = [] } = useQuery<EventRow[]>({
    queryKey: ["matrix-events", user?.id, videoIds.join(",")],
    enabled: videoIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - DAYS + 1);
      since.setHours(0, 0, 0, 0);
      const { data } = await (supabase as any)
        .from("video_view_events")
        .select(
          "video_id, session_id, visitor_fingerprint, ip_ua_hash, started_at, watch_position_seconds, max_position_seconds, duration_seconds, source_type",
        )
        .in("video_id", videoIds)
        .gte("started_at", since.toISOString())
        .limit(20000);
      return (data as EventRow[]) || [];
    },
  });

  const days = useMemo(() => lastNDays(DAYS), []);

  // matrix: video_id -> day_key -> Set(fp)
  const { matrix, totals } = useMemo(() => {
    const m: Record<string, Record<string, Set<string>>> = {};
    const t: Record<string, number> = {};
    for (const v of videos) {
      m[v.id] = {};
      t[v.id] = 0;
    }
    const seenAllTime: Record<string, Set<string>> = {};
    for (const e of events) {
      if (!m[e.video_id]) continue;
      const dk = dayKey(e.started_at);
      const fp = e.visitor_fingerprint || e.ip_ua_hash || e.session_id;
      if (!m[e.video_id][dk]) m[e.video_id][dk] = new Set();
      m[e.video_id][dk].add(fp);
      if (!seenAllTime[e.video_id]) seenAllTime[e.video_id] = new Set();
      seenAllTime[e.video_id].add(fp);
    }
    for (const id of Object.keys(seenAllTime)) t[id] = seenAllTime[id].size;
    return { matrix: m, totals: t };
  }, [events, videos]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    const filtered = events.filter(
      (e) => e.video_id === drill.video.id && dayKey(e.started_at) === drill.dayKey,
    );
    // one row per fingerprint (best progress)
    const byFp = new Map<string, EventRow>();
    for (const e of filtered) {
      const fp = e.visitor_fingerprint || e.ip_ua_hash || e.session_id;
      const cur = byFp.get(fp);
      if (!cur) {
        byFp.set(fp, e);
      } else {
        const bestReached = Math.max(cur.max_position_seconds || 0, cur.watch_position_seconds || 0);
        const newReached = Math.max(e.max_position_seconds || 0, e.watch_position_seconds || 0);
        if (newReached > bestReached) byFp.set(fp, e);
      }
    }
    const arr = Array.from(byFp.values()).map((e) => ({
      fp: e.visitor_fingerprint || e.ip_ua_hash || e.session_id,
      pct: watchedPercent(e.watch_position_seconds, e.max_position_seconds, e.duration_seconds),
      dropoff: Math.max(e.max_position_seconds || 0, e.watch_position_seconds || 0),
      source: e.source_type || "direct",
      when: e.started_at,
    }));
    arr.sort((a, b) => b.pct - a.pct);
    if (filter === "watched50") return arr.filter((r) => r.pct >= 50);
    return arr;
  }, [drill, events, filter]);

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-heading font-semibold">Tracking matrix</h2>
          <p className="text-xs text-muted-foreground">Unique viewers per video per day · tap any cell</p>
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No videos yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card/95 backdrop-blur px-2 py-2 text-left font-semibold">
                  Video
                </th>
                <th className="px-2 py-2 text-right font-semibold text-muted-foreground">All</th>
                {days.map((d) => (
                  <th
                    key={d.key}
                    className="min-w-[54px] px-1 py-2 text-center font-medium text-muted-foreground"
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-t border-border/40">
                  <td className="sticky left-0 z-10 bg-card/95 backdrop-blur px-2 py-2">
                    <div className="flex items-center gap-2 min-w-[140px] max-w-[180px]">
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt=""
                          className="h-8 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="grid h-8 w-12 shrink-0 place-items-center rounded bg-muted">
                          <VideoIcon size={12} className="text-muted-foreground" />
                        </div>
                      )}
                      <span className="truncate text-xs font-medium">{v.title}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {totals[v.id] || 0}
                  </td>
                  {days.map((d) => {
                    const n = matrix[v.id]?.[d.key]?.size || 0;
                    return (
                      <td key={d.key} className="px-1 py-1 text-center">
                        <button
                          disabled={n === 0}
                          onClick={() => setDrill({ video: v, dayKey: d.key, label: d.label })}
                          className={`w-full rounded px-1.5 py-1 tabular-nums ${
                            n === 0
                              ? "text-muted-foreground/40"
                              : n >= 5
                                ? "bg-primary/15 font-semibold text-primary hover:bg-primary/25"
                                : "bg-primary/5 text-primary hover:bg-primary/15"
                          }`}
                        >
                          {n || "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">
              {drill?.video.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">· {drill?.label}</span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["all", "watched50"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filter === f
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {f === "all" ? "All viewers" : "Watched > 50%"}
              </button>
            ))}
          </div>

          <ul className="mt-4 space-y-2">
            {drillRows.length === 0 && (
              <li className="py-6 text-center text-xs text-muted-foreground">No viewers match.</li>
            )}
            {drillRows.map((r) => (
              <li
                key={r.fp}
                className="rounded-xl border border-border bg-background/40 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Anonymous · {r.source}</span>
                  <span className="tabular-nums font-semibold">{r.pct}%</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Stopped at {formatDropoff(r.dropoff)} · {formatDistanceToNow(new Date(r.when), { addSuffix: true })}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${r.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default TrackingMatrix;
