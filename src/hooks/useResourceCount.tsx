import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useResourceCount = () => {
  const { user } = useAuth();

  const { data: counts = { funnels: 0, landing_pages: 0, live_sessions: 0, videos: 0 } } = useQuery({
    queryKey: ["resource-counts", user?.id],
    queryFn: async () => {
      if (!user) return { funnels: 0, landing_pages: 0, live_sessions: 0, videos: 0 };

      const [funnelRes, lpRes, liveRes, videoRes] = await Promise.all([
        supabase.from("funnels").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("landing_pages").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("live_sessions").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
        supabase.from("video_assets").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      ]);

      return {
        funnels: funnelRes.count || 0,
        landing_pages: lpRes.count || 0,
        live_sessions: liveRes.count || 0,
        videos: videoRes.count || 0,
      };
    },
    enabled: !!user,
    staleTime: 15000,
  });

  return counts;
};
