import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { buildOgMeta, genericNevoraiMeta, SITE } from "@/lib/ogMeta";

type PublicFunnelMeta = {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  first_video_thumb: string | null;
} | null;

export const Route = createFileRoute("/f/$slug/")({
  loader: async ({ params }): Promise<{ funnel: PublicFunnelMeta }> => {
    try {
      const { data } = await (supabase as any)
        .from("funnels")
        .select("id, slug, title, description, thumbnail_url, is_published, visibility")
        .eq("slug", params.slug)
        .eq("is_published", true)
        .maybeSingle();
      if (!data) return { funnel: null };

      let firstVideoThumb: string | null = null;
      if (!data.thumbnail_url) {
        try {
          const { data: steps } = await (supabase as any)
            .from("funnel_steps")
            .select("video_asset_id, step_order, video_assets:video_asset_id(thumbnail_url)")
            .eq("funnel_id", data.id)
            .not("video_asset_id", "is", null)
            .order("step_order", { ascending: true })
            .limit(1);
          const step = Array.isArray(steps) ? steps[0] : null;
          firstVideoThumb = step?.video_assets?.thumbnail_url ?? null;
        } catch {}
      }

      return {
        funnel: {
          id: data.id,
          slug: data.slug,
          title: data.title ?? null,
          description: data.description ?? null,
          thumbnail_url: data.thumbnail_url ?? null,
          first_video_thumb: firstVideoThumb,
        },
      };
    } catch {
      return { funnel: null };
    }
  },
  head: ({ params, loaderData }) => {
    const f = loaderData?.funnel;
    const url = `${SITE}/f/${params.slug}`;
    if (!f) return genericNevoraiMeta(url, "Funnel");

    const title = f.title ?? "Funnel";
    const description = f.description?.trim() || "Watch this on Nevorai.";
    const image = f.thumbnail_url || f.first_video_thumb || undefined;

    return buildOgMeta({ title, description, url, image });
  },
});
