import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// IST helpers — match useDailyViews / useViewsTrend convention
const istDateStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

export interface OwnerUniquePeople {
  total: number;
  video: number;
  funnel: number;
  landing: number;
  live: number;
}

const EMPTY: OwnerUniquePeople = { total: 0, video: 0, funnel: 0, landing: 0, live: 0 };

/**
 * Unique people for the owner across all surfaces in a window.
 * window: "today" | "month" | "all" | { fromIso, toIso }
 */
export const useOwnerUniquePeople = (
  window: "today" | "month" | "all" | { fromIso: string; toIso: string } = "all",
) => {
  const { user } = useAuth();

  const bounds = (() => {
    if (typeof window === "object") return { from: window.fromIso, to: window.toIso };
    if (window === "today") {
      // IST midnight today → now (UTC)
      const now = new Date();
      const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      ist.setUTCHours(0, 0, 0, 0);
      const from = new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: new Date().toISOString() };
    }
    if (window === "month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: new Date().toISOString() };
    }
    return { from: null as string | null, to: null as string | null };
  })();

  const { data } = useQuery({
    queryKey: ["owner-unique-people", user?.id, bounds.from, bounds.to],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<OwnerUniquePeople> => {
      const { data, error } = await (supabase as any).rpc("get_owner_unique_people", {
        p_owner_id: user!.id,
        p_from: bounds.from,
        p_to: bounds.to,
      });
      if (error || !data || !data.length) return EMPTY;
      const row = data[0];
      return {
        total: Number(row.total_people || 0),
        video: Number(row.video_people || 0),
        funnel: Number(row.funnel_people || 0),
        landing: Number(row.landing_people || 0),
        live: Number(row.live_people || 0),
      };
    },
  });

  return data ?? EMPTY;
};

/**
 * Daily unique-people series for the owner. Returns { yesterday, last7, last30, today }.
 * Replaces useViewsTrend (which read user_daily_views — that's the quota counter).
 */
export const useUniquePeopleTrend = () => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["unique-people-trend", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const from = istDateStr(30);
      const to = istDateStr(0);
      const { data: rows, error } = await (supabase as any).rpc("get_owner_unique_people_daily", {
        p_owner_id: user!.id,
        p_from: from,
        p_to: to,
      });
      if (error || !rows) return { today: 0, yesterday: 0, last7: 0, last30: 0 };

      const map = new Map<string, number>();
      for (const r of rows as Array<{ day: string; people: number }>) {
        map.set(r.day, Number(r.people || 0));
      }
      const today = map.get(istDateStr(0)) || 0;
      const yesterday = map.get(istDateStr(1)) || 0;
      let last7 = 0;
      for (let i = 1; i <= 7; i++) last7 += map.get(istDateStr(i)) || 0;
      let last30 = 0;
      for (let i = 1; i <= 30; i++) last30 += map.get(istDateStr(i)) || 0;
      return { today, yesterday, last7, last30 };
    },
  });

  return data ?? { today: 0, yesterday: 0, last7: 0, last30: 0 };
};

/**
 * Per-entity unique people. Use for funnel/video/landing/live insight pages and cards.
 */
export const useEntityUniquePeople = (
  entityType: "video" | "funnel" | "landing_page" | "live",
  entityId: string | null | undefined,
  range?: { fromIso?: string | null; toIso?: string | null },
) => {
  const { data } = useQuery({
    queryKey: ["entity-unique-people", entityType, entityId, range?.fromIso, range?.toIso],
    enabled: !!entityId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any).rpc("get_unique_people", {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_from: range?.fromIso ?? null,
        p_to: range?.toIso ?? null,
      });
      if (error || data == null) return 0;
      return Number(data);
    },
  });
  return data ?? 0;
};
