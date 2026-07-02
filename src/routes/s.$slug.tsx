import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { buildOgMeta, genericNevoraiMeta, SITE } from "@/lib/ogMeta";

// /s/$slug is a short/share URL. In this app it primarily maps to a live
// session by slug (PublicLivePage), but we also fall back to funnel /
// landing / video lookups so a shared short link previews identically
// regardless of the destination type.

type Resolved =
  | {
      kind: "live";
      title: string;
      description: string | null;
      image: string | null;
    }
  | {
      kind: "funnel";
      title: string;
      description: string | null;
      image: string | null;
    }
  | {
      kind: "landing";
      title: string;
      description: string | null;
      image: string | null;
    }
  | {
      kind: "video";
      title: string;
      description: string | null;
      image: string | null;
    }
  | null;

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }): Promise<{ resolved: Resolved }> => {
    const slug = params.slug;

    // 1) Live session by slug (primary use of /s/)
    try {
      const { data } = await (supabase as any)
        .from("live_sessions")
        .select(
          "title, description, cover_image_url, thumbnail_url, is_published, video_asset_id, funnel_id",
        )
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (data) {
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
          resolved: {
            kind: "live",
            title: data.title ?? "Live Session",
            description: data.description ?? null,
            image,
          },
        };
      }
    } catch {}

    // 2) Funnel by slug
    try {
      const { data } = await (supabase as any)
        .from("funnels")
        .select("title, description, thumbnail_url, is_published")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (data) {
        return {
          resolved: {
            kind: "funnel",
            title: data.title ?? "Funnel",
            description: data.description ?? null,
            image: data.thumbnail_url ?? null,
          },
        };
      }
    } catch {}

    // 3) Landing page by slug
    try {
      const { data } = await (supabase as any)
        .from("landing_pages")
        .select("title, description, og_title, og_description, og_image_url, status")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (data) {
        return {
          resolved: {
            kind: "landing",
            title: data.og_title || data.title || "Nevorai",
            description: data.og_description || data.description || null,
            image: data.og_image_url ?? null,
          },
        };
      }
    } catch {}

    // 4) Video by slug
    try {
      const { data } = await (supabase as any)
        .from("video_assets")
        .select("title, description, thumbnail_url, is_shared")
        .eq("slug", slug)
        .eq("is_shared", true)
        .maybeSingle();
      if (data) {
        return {
          resolved: {
            kind: "video",
            title: data.title ?? "Video",
            description: data.description ?? null,
            image: data.thumbnail_url ?? null,
          },
        };
      }
    } catch {}

    return { resolved: null };
  },
  head: ({ params, loaderData }) => {
    const r = loaderData?.resolved;
    const url = `${SITE}/s/${params.slug}`;
    if (!r) return genericNevoraiMeta(url);

    const description = r.description?.trim() || "Watch this on Nevorai.";
    const type = r.kind === "video" ? "video.other" : "website";
    return buildOgMeta({
      title: r.title,
      description,
      url,
      image: r.image ?? undefined,
      type,
    });
  },
});
