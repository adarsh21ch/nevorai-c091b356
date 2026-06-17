import { useEffect } from "react";
import { extractYouTubeId, buildYouTubeEmbedUrl } from "@/lib/youtube";
import { startVideoView } from "@/lib/videoTracking.functions";
import type { VideoTrackingMeta } from "@/hooks/useVideoTracking";

interface YouTubeEmbedProps {
  src: string;
  poster?: string;
  autoplay?: boolean;
  initialTime?: number;
  title?: string;
  tracking?: VideoTrackingMeta;
}

/**
 * Privacy-enhanced YouTube embed. Hardened against showing related,
 * end-screen, or annotation suggestions so viewers stay on our flow.
 *
 * Renders to fill its parent — wrap in an aspect-video container.
 *
 * Tracking: YouTube's iframe doesn't expose play/progress events without
 * the full IFrame API + user gesture coordination, so we fire ONE start
 * event on mount (deduped per tab-session). This guarantees funnel/landing
 * YouTube videos still increment views in video_view_events. Progress
 * milestones are not reliably available for YT embeds — accepted trade-off.
 */
export const YouTubeEmbed = ({
  src,
  autoplay = false,
  initialTime,
  title,
  tracking,
}: YouTubeEmbedProps) => {
  const videoId = extractYouTubeId(src);

  useEffect(() => {
    if (!videoId || !tracking?.videoId) return;
    if (typeof window === "undefined") return;
    try {
      const key = `nv_v_seen:${tracking.videoId}:${tracking.sourceType}:${tracking.sourceId ?? ""}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore storage errors, still attempt to record
    }
    let sessionId: string;
    try {
      sessionId =
        sessionStorage.getItem("nv_session_id") ||
        (() => {
          const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(
            /-/g,
            "",
          );
          sessionStorage.setItem("nv_session_id", id);
          return id;
        })();
    } catch {
      sessionId = Math.random().toString(36).slice(2);
    }
    let fingerprint: string | null = null;
    try {
      fingerprint =
        localStorage.getItem("nv_fp_id") ||
        (() => {
          const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(
            /-/g,
            "",
          );
          localStorage.setItem("nv_fp_id", id);
          return id;
        })();
    } catch {
      fingerprint = null;
    }
    startVideoView({
      data: {
        videoId: tracking.videoId,
        sourceType: tracking.sourceType,
        sourceId: tracking.sourceId ?? null,
        sessionId,
        fingerprint,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        durationSeconds: null,
        deviceType: /Mobi|Android|iPhone|iPad/i.test(
          typeof navigator !== "undefined" ? navigator.userAgent : "",
        )
          ? "mobile"
          : "desktop",
        referrerSource: (typeof document !== "undefined" && document.referrer) || undefined,
      },
    }).catch((err) => console.error("YouTubeEmbed tracking failed:", err));
  }, [videoId, tracking?.videoId, tracking?.sourceType, tracking?.sourceId]);

  if (!videoId) return null;
  const embedUrl = buildYouTubeEmbedUrl(videoId, { autoplay, start: initialTime });
  return (
    <iframe
      src={embedUrl}
      title={title || "YouTube video player"}
      className="absolute inset-0 w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      loading="lazy"
    />
  );
};

export default YouTubeEmbed;
