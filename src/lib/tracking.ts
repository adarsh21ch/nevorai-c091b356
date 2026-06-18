import { startEntityView, heartbeatEntityView } from "@/lib/entityTracking.functions";
import { supabase } from "@/integrations/supabase/client";

type EntityType = "funnel" | "landing_page" | "live_session";
export type ViewSurface = "video" | "landing" | "live";

const SESSION_KEY = "nv_session_id";

export function getTrackingSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr-no-session";
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

function detectDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

function detectReferrer(): string {
  if (typeof document === "undefined") return "direct";
  const ref = document.referrer || "";
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname.toLowerCase();
    if (host.includes("whatsapp") || host === "wa.me") return "whatsapp";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("facebook") || host === "fb.com") return "facebook";
    if (host.includes("youtube") || host === "youtu.be") return "youtube";
    if (host.includes("google")) return "google";
    if (host.includes("t.co") || host.includes("twitter") || host.includes("x.com")) return "twitter";
    return "other";
  } catch {
    return "other";
  }
}

/**
 * Track a view on a public entity page (funnel/landing-page/live-session).
 * Sends a single start event + a heartbeat every 30s while the tab is visible.
 * Returns a cleanup function — call it on unmount.
 */
/**
 * Resolve the ?t= attribution token in the URL to a share_link_id.
 * Cached in sessionStorage so we only query once per page.
 */
const SHARE_LINK_SS_KEY = "nf_share_link_id";
async function resolveShareLinkIdFromUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const cached = sessionStorage.getItem(SHARE_LINK_SS_KEY);
    if (cached !== null) return cached || null;
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("t") || params.get("ref") || "").trim();
    if (!token) {
      sessionStorage.setItem(SHARE_LINK_SS_KEY, "");
      return null;
    }
    const { data } = await (supabase as any)
      .from("funnel_share_links")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    const id = data?.id ?? null;
    sessionStorage.setItem(SHARE_LINK_SS_KEY, id ?? "");
    return id;
  } catch {
    return null;
  }
}

export function trackEntityView(entityType: EntityType, entityId: string | null | undefined) {
  if (!entityId || typeof window === "undefined") return () => {};

  let eventId: string | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const start = async () => {
    try {
      const shareLinkId =
        entityType === "funnel" ? await resolveShareLinkIdFromUrl() : null;
      const res = await startEntityView({
        data: {
          entityType,
          entityId,
          sessionId: getOrCreateSessionId(),
          deviceType: detectDevice(),
          referrerSource: detectReferrer(),
          shareLinkId,
        },
      });
      if (cancelled) return;
      eventId = res?.eventId ?? null;
      if (eventId) {
        interval = setInterval(() => {
          if (document.visibilityState !== "visible") return;
          if (!eventId) return;
          heartbeatEntityView({ data: { entityType, eventId } }).catch(() => {});
        }, 30_000);
      }
    } catch (err) {
      console.debug("trackEntityView failed (non-fatal):", err);
    }
  };

  void start();

  return () => {
    cancelled = true;
    if (interval) clearInterval(interval);
  };
}

/**
 * Unified view recorder. Routes any non-funnel surface through the
 * record_view RPC so views + people (unique fingerprints) are tracked
 * consistently. Funnel views go through trackFunnelEvent (link_events).
 */
export function trackView(surface: ViewSurface, entityId: string | null | undefined) {
  if (!entityId || typeof window === "undefined") return;
  try {
    const fp = getOrCreateSessionId();
    void (supabase as any).rpc("record_view", {
      p_surface: surface,
      p_entity_id: entityId,
      p_fingerprint: fp,
      p_session_id: fp,
      p_user_agent: navigator.userAgent || null,
      p_referrer: detectReferrer(),
      p_device: detectDevice(),
    });
  } catch (err) {
    console.debug("trackView failed (non-fatal):", err);
  }
}

/**
 * Returns attribution metadata to attach to a lead/registration form
 * submission. Reads UTM params from the URL and the current referrer.
 */
export function captureAttribution(
  sourceType: "funnel" | "landing_page" | "video" | "live_session",
  sourceId: string,
  sourceSlug?: string,
) {
  if (typeof window === "undefined") {
    return {
      source_type: sourceType,
      source_id: sourceId,
      source_slug: sourceSlug ?? null,
      captured_at: new Date().toISOString(),
      referrer_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    source_type: sourceType,
    source_id: sourceId,
    source_slug: sourceSlug ?? null,
    captured_at: new Date().toISOString(),
    referrer_url: document.referrer || null,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };
}
