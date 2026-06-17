import { useEffect, useRef } from "react";
import { startVideoView, heartbeatVideoView } from "@/lib/videoTracking.functions";

/**
 * Canonical surface where a video is being played.
 * Adding a new surface = add a new string here (no schema change required).
 */
export type VideoSourceType = "direct" | "funnel" | "landing" | "live" | "course" | "other";

export interface VideoTrackingMeta {
  videoId: string;
  sourceType: VideoSourceType;
  sourceId?: string | null;
}

const SESSION_KEY = "nv_session_id";
const FINGERPRINT_KEY = "nv_fp_id";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function getOrCreateFingerprint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = localStorage.getItem(FINGERPRINT_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
      localStorage.setItem(FINGERPRINT_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Guard so refresh/seek/replay in the same tab doesn't multi-count one view. */
function alreadyCountedThisSession(meta: VideoTrackingMeta): boolean {
  if (typeof window === "undefined") return true;
  try {
    const key = `nv_v_seen:${meta.videoId}:${meta.sourceType}:${meta.sourceId ?? ""}`;
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
    return false;
  } catch {
    return false;
  }
}

function detectDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";
}

/**
 * Attach view tracking to a <video> element. This is the SINGLE writer
 * for video plays across every surface (direct, funnel, landing, live, …).
 *
 * - First play in a tab-session writes ONE row to `video_view_events`,
 *   tagged with `source_type` + `source_id`.
 * - Heartbeats mark 25/50/75% progress and >=80% completion.
 * - Refresh/seek in the same tab does not multi-count (sessionStorage guard).
 */
export function useVideoTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  meta?: VideoTrackingMeta | null,
) {
  const eventIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const milestonesRef = useRef<Set<number>>(new Set());
  const completedRef = useRef(false);
  const maxPosRef = useRef(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !meta?.videoId) return;

    const start = async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (alreadyCountedThisSession(meta)) return; // dedup within tab
      try {
        const res = await startVideoView({
          data: {
            videoId: meta.videoId,
            sourceType: meta.sourceType,
            sourceId: meta.sourceId ?? null,
            sessionId: getOrCreateSessionId(),
            fingerprint: getOrCreateFingerprint(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
            durationSeconds: isFinite(v.duration) ? Math.floor(v.duration) : null,
            deviceType: detectDevice(),
            referrerSource: (typeof document !== "undefined" && document.referrer) || undefined,
          },
        });
        eventIdRef.current = res?.eventId ?? null;
      } catch (err) {
        console.error("startVideoView failed:", err);
      }
    };

    const sendHeartbeat = (completed: boolean) => {
      const eventId = eventIdRef.current;
      if (!eventId) return;
      heartbeatVideoView({
        data: {
          eventId,
          watchPosition: Math.floor(v.currentTime || 0),
          maxPosition: Math.floor(maxPosRef.current),
          completed,
        },
      }).catch(() => {});
    };

    const onPlay = () => void start();

    const onTimeUpdate = () => {
      const cur = v.currentTime || 0;
      if (cur > maxPosRef.current) maxPosRef.current = cur;
      const dur = v.duration;
      if (!isFinite(dur) || dur <= 0) return;
      const pct = (cur / dur) * 100;
      for (const m of [25, 50, 75]) {
        if (pct >= m && !milestonesRef.current.has(m)) {
          milestonesRef.current.add(m);
          sendHeartbeat(false);
        }
      }
      if (pct >= 80 && !completedRef.current) {
        completedRef.current = true;
        sendHeartbeat(true);
      }
    };

    const onEnded = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      sendHeartbeat(true);
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef, meta?.videoId, meta?.sourceType, meta?.sourceId]);
}
