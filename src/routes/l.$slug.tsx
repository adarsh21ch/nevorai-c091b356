import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { buildOgMeta, genericNevoraiMeta, SITE } from "@/lib/ogMeta";

type PublicLandingMeta = {
  id: string;
  title: string | null;
  description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  form_subtitle: string | null;
  video_thumb: string | null;
  funnel_thumb: string | null;
} | null;

export const Route = createFileRoute("/l/$slug")({
  loader: async ({ params }): Promise<{ page: PublicLandingMeta }> => {
    try {
      const { data } = await (supabase as any)
        .from("landing_pages")
        .select(
          "id, title, description, og_title, og_description, og_image_url, form_subtitle, post_submit_video_asset_id, linked_funnel_id, status",
        )
        .eq("slug", params.slug)
        .eq("status", "published")
        .maybeSingle();
      if (!data) return { page: null };

      let videoThumb: string | null = null;
      let funnelThumb: string | null = null;
      if (!data.og_image_url && data.post_submit_video_asset_id) {
        try {
          const { data: v } = await (supabase as any)
            .from("video_assets")
            .select("thumbnail_url")
            .eq("id", data.post_submit_video_asset_id)
            .maybeSingle();
          videoThumb = v?.thumbnail_url ?? null;
        } catch {}
      }
      if (!data.og_image_url && !videoThumb && data.linked_funnel_id) {
        try {
          const { data: f } = await (supabase as any)
            .from("funnels")
            .select("thumbnail_url")
            .eq("id", data.linked_funnel_id)
            .maybeSingle();
          funnelThumb = f?.thumbnail_url ?? null;
        } catch {}
      }

      return {
        page: {
          id: data.id,
          title: data.title ?? null,
          description: data.description ?? null,
          og_title: data.og_title ?? null,
          og_description: data.og_description ?? null,
          og_image_url: data.og_image_url ?? null,
          form_subtitle: data.form_subtitle ?? null,
          video_thumb: videoThumb,
          funnel_thumb: funnelThumb,
        },
      };
    } catch {
      return { page: null };
    }
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.page;
    const url = `${SITE}/l/${params.slug}`;
    if (!p) return genericNevoraiMeta(url, "Nevorai");

    const title = p.og_title?.trim() || p.title?.trim() || "Nevorai";
    const description =
      p.og_description?.trim() ||
      p.description?.trim() ||
      p.form_subtitle?.trim() ||
      "Watch this on Nevorai.";
    const image = p.og_image_url || p.video_thumb || p.funnel_thumb || undefined;

    return buildOgMeta({ title, description, url, image });
  },
});
