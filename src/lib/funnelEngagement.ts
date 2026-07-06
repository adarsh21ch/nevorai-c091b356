// Lightweight client helper for posting engagement events to the
// funnel-engagement-log edge function.
import { supabaseProjectUrl, supabasePublishableKey } from "@/integrations/supabase/client";

const ENDPOINT = `${supabaseProjectUrl}/functions/v1/funnel-engagement-log`;

export type EngagementEvent =
  | "view_start"
  | "progress_25"
  | "progress_50"
  | "progress_75"
  | "completed"
  | "lead_submitted"
  | "exit";

const SESSION_KEY = "nf_engagement_session";

export function getEngagementSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return `${Date.now()}`;
  }
}

interface LogOpts {
  funnel_id: string;
  event_type: EngagementEvent;
  viewer_phone?: string | null;
  viewer_email?: string | null;
  video_position_sec?: number | null;
  video_duration_sec?: number | null;
  useBeacon?: boolean;
}

export function logFunnelEngagement(opts: LogOpts): void {
  if (typeof window === "undefined" || !opts.funnel_id) return;
  const body = JSON.stringify({
    funnel_id: opts.funnel_id,
    session_id: getEngagementSessionId(),
    event_type: opts.event_type,
    viewer_phone: opts.viewer_phone ?? null,
    viewer_email: opts.viewer_email ?? null,
    video_position_sec: opts.video_position_sec ?? null,
    video_duration_sec: opts.video_duration_sec ?? null,
  });

  try {
    if (opts.useBeacon && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    // Public endpoint (verify_jwt=false). Do NOT send Authorization —
    // the edge function's CORS does not allow it, and it would trigger a
    // preflight rejection ("authorization is not allowed by
    // Access-Control-Allow-Headers"). apikey is enough.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabasePublishableKey,
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // swallow — engagement logging is best-effort
  }
}
