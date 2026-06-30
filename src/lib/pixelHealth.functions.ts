import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const Scope = z.enum(["funnel", "landing"]);

const HealthInput = z.object({
  scope: Scope,
  resourceId: z.string().uuid(),
});

export type PixelHealthStatus = "healthy" | "partial" | "not_firing" | "fallback" | "unknown";

export type PixelHealthResult = {
  status: PixelHealthStatus;
  resolvedPixelId: string | null;
  resolvedSource: "this" | "account" | "platform";
  last24h: { pageViews: number; leads: number; total: number; successRate: number };
  last7d: { total: number };
  lastEventAt: string | null;
  lastEventName: string | null;
  sparkline: Array<{ day: string; count: number }>;
  recent: Array<{ event_name: string; success: boolean; created_at: string; pixel_id: string | null; is_test: boolean }>;
};

const EMPTY_HEALTH = (): PixelHealthResult => ({
  status: "unknown",
  resolvedPixelId: null,
  resolvedSource: "platform",
  last24h: { pageViews: 0, leads: 0, total: 0, successRate: 0 },
  last7d: { total: 0 },
  lastEventAt: null,
  lastEventName: null,
  sparkline: Array.from({ length: 7 }, (_, i) => ({
    day: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10),
    count: 0,
  })),
  recent: [],
});

export const getPixelHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => HealthInput.parse(input))
  .handler(async ({ data, context }): Promise<PixelHealthResult> => {
    try {
    const { scope, resourceId } = data;
    const table = scope === "funnel" ? "funnels" : "landing_pages";

    // Resolve effective pixel: resource override → account default → platform
    const { data: row } = await (supabaseAdmin as any)
      .from(table)
      .select("meta_pixel_id, owner_id")
      .eq("id", resourceId)
      .maybeSingle();
    if (!row || (row as any).owner_id !== (context as any).userId) {
      // Not the owner (or row missing) — return empty rather than 500ing.
      return EMPTY_HEALTH();
    }

    let resolvedPixelId: string | null = (row as any)?.meta_pixel_id ?? null;
    let resolvedSource: "this" | "account" | "platform" = resolvedPixelId ? "this" : "platform";

    if (!resolvedPixelId && (row as any)?.owner_id) {
      const { data: profile } = await (supabaseAdmin as any)
        .from("profiles")
        .select("meta_pixel_id")
        .eq("id", (row as any).owner_id)
        .maybeSingle();
      if ((profile as any)?.meta_pixel_id) {
        resolvedPixelId = (profile as any).meta_pixel_id;
        resolvedSource = "account";
      }
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events24 } = await (supabaseAdmin as any)
      .from("pixel_fire_log")
      .select("event_name, success, created_at, pixel_id, is_test")
      .eq("scope", scope)
      .eq("resource_id", resourceId)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false });

    const { data: events7 } = await (supabaseAdmin as any)
      .from("pixel_fire_log")
      .select("created_at, success")
      .eq("scope", scope)
      .eq("resource_id", resourceId)
      .gte("created_at", since7d);

    const rows24: any[] = (events24 as any[]) ?? [];
    const rows7: any[] = (events7 as any[]) ?? [];
    const realRows24 = rows24.filter((r) => !r.is_test);

    const pageViews = realRows24.filter((r) => r.event_name === "PageView").length;
    const leads = realRows24.filter((r) => r.event_name === "Lead").length;
    const total = realRows24.length;
    const successes = realRows24.filter((r) => r.success).length;
    const successRate = total ? Math.round((successes / total) * 100) : 0;

    // Sparkline: events per day for last 7 days
    const sparkMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      sparkMap.set(d.toISOString().slice(0, 10), 0);
    }
    rows7.forEach((r) => {
      const k = String(r.created_at).slice(0, 10);
      if (sparkMap.has(k)) sparkMap.set(k, (sparkMap.get(k) ?? 0) + 1);
    });
    const sparkline = Array.from(sparkMap, ([day, count]) => ({ day, count }));

    let status: PixelHealthStatus = "unknown";
    if (!resolvedPixelId) status = "fallback";
    else if (total === 0) status = "not_firing";
    else if (successRate >= 90) status = "healthy";
    else status = "partial";

    return {
      status,
      resolvedPixelId,
      resolvedSource,
      last24h: { pageViews, leads, total, successRate },
      last7d: { total: rows7.length },
      lastEventAt: realRows24[0]?.created_at ?? null,
      lastEventName: realRows24[0]?.event_name ?? null,
      sparkline,
      recent: realRows24.slice(0, 5).map((r) => ({
        event_name: r.event_name,
        success: r.success,
        created_at: r.created_at,
        pixel_id: r.pixel_id,
        is_test: r.is_test,
      })),
    };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[getPixelHealth] failed:", err);
      return EMPTY_HEALTH();
    }
  });

// ===== Verifier: poll for a test run's events =====

const VerifyInput = z.object({
  runId: z.string().min(8).max(64),
});

export type VerifyResult = {
  found: boolean;
  events: Array<{ event_name: string; pixel_id: string | null; success: boolean; created_at: string }>;
  pixelId: string | null;
};

export const checkPixelTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VerifyInput.parse(input))
  .handler(async ({ data, context }): Promise<VerifyResult> => {
    const { data: rows } = await (supabaseAdmin as any)
      .from("pixel_fire_log")
      .select("event_name, pixel_id, success, created_at, owner_id")
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true });
    const events = ((rows as any[]) ?? []).filter(
      (r) => !r.owner_id || r.owner_id === (context as any).userId,
    );

    return {
      found: events.length > 0,
      events,
      pixelId: events[0]?.pixel_id ?? null,
    };
  });
