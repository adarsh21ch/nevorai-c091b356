import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const StartSchema = z.object({
  videoId: z.string().uuid(),
  sessionId: z.string().min(8).max(64),
  sourceType: z.enum(["direct", "funnel", "landing", "live", "course", "other"]).default("direct"),
  sourceId: z.string().uuid().nullable().optional(),
  fingerprint: z.string().max(128).nullable().optional(),
  userAgent: z.string().max(512).nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  deviceType: z.string().max(20).optional(),
  referrerSource: z.string().max(255).optional(),
});

const HeartbeatSchema = z.object({
  eventId: z.string().uuid(),
  watchPosition: z.number().min(0).max(100000),
  maxPosition: z.number().min(0).max(100000),
  completed: z.boolean().optional(),
  skipAttempts: z.number().int().min(0).max(10000).optional(),
});

export const startVideoView = createServerFn({ method: "POST" })
  .inputValidator((input) => StartSchema.parse(input))
  .handler(async ({ data }) => {
    // Delegate to the security-definer `record_view` RPC. The RPC owns
    // the insert into video_view_events + server-side fingerprint/IP hashing,
    // so every surface (direct/funnel/landing/live/…) goes through one path.
    const { data: eventId, error } = await supabaseAdmin.rpc("record_view" as any, {
      p_surface: data.sourceType,
      p_entity_id: data.videoId,
      p_fingerprint: data.fingerprint ?? null,
      p_session_id: data.sessionId,
      p_user_agent: data.userAgent ?? null,
      p_referrer: data.referrerSource ?? null,
      p_device: data.deviceType ?? null,
    } as any);
    if (error) {
      console.error("startVideoView (record_view) error:", error.message);
      throw new Error(`startVideoView record_view failed: ${error.message}`);
    }
    // record_view may return either a uuid (event id) or null when deduped.
    return { eventId: (eventId as unknown as string | null) ?? null };
  });

export const heartbeatVideoView = createServerFn({ method: "POST" })
  .inputValidator((input) => HeartbeatSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("video_view_events" as any)
      .update({
        watch_position_seconds: data.watchPosition,
        max_position_seconds: data.maxPosition,
        completed: data.completed ?? false,
        skip_attempts: data.skipAttempts ?? 0,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", data.eventId);
    if (error) console.error("heartbeatVideoView error:", error.message);
    return { ok: !error };
  });
