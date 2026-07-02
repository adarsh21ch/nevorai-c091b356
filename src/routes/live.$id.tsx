import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { buildOgMeta, genericNevoraiMeta, SITE } from "@/lib/ogMeta";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicLiveMeta = {
  title: string;
  description: string | null;
  image: string | null;
} | null;

export const Route = createFileRoute("/live/$id")({
  loader: async ({ params }): Promise<{ live: PublicLiveMeta }> => {
    try {
      const looksLikeUuid = UUID_RE.test(params.id);
      const column = looksLikeUuid ? "id" : "slug";
      const { data } = await (supabase as any)
        .from("live_sessions")
        .select(
          "title, description, cover_image_url, thumbnail_url, video_asset_id, funnel_id, is_published",
        )
        .eq(column, params.id)
        .eq("is_published", true)
        .maybeSingle();
      if (!data) return { live: null };

      let image: string | null =
        data.cover_image_url || data.thumbnail_url || null;
      if (!image && data.video_asset_id) {
        try {
          const { data: v } = await (supabase as any)
            .from("video_assets")
            .select("thumbnail_url")
            .eq("id", data.video_asset_id)
            .maybeSingle();
          image = v?.thumbnail_url ?? null;
        } catch {}
      }
      if (!image && data.funnel_id) {
        try {
          const { data: f } = await (supabase as any)
            .from("funnels")
            .select("thumbnail_url")
            .eq("id", data.funnel_id)
            .maybeSingle();
          image = f?.thumbnail_url ?? null;
        } catch {}
      }

      return {
        live: {
          title: data.title ?? "Live",
          description: data.description ?? null,
          image,
        },
      };
    } catch {
      return { live: null };
    }
  },
  head: ({ params, loaderData }) => {
    const l = loaderData?.live;
    const url = `${SITE}/live/${params.id}`;
    if (!l) return genericNevoraiMeta(url, "Live");

    const title = `${l.title} — Live on Nevorai`;
    const description = l.description?.trim() || "Join this live session on Nevorai.";
    return buildOgMeta({
      title,
      description,
      url,
      image: l.image ?? undefined,
    });
  },
});
