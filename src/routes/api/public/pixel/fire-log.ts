import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

// Per-IP token bucket (in-memory; per-Worker instance). Cheap abuse brake — not a hard cap.
const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;             // events
const RATE_WINDOW_MS = 60_000;      // per minute per IP
const MAX_BODY_BYTES = 4_096;       // 4KB is far more than a fire-log payload needs

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const slot = RATE_BUCKET.get(ip);
  if (!slot || slot.resetAt < now) {
    RATE_BUCKET.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  slot.count += 1;
  return slot.count > RATE_LIMIT;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/pixel/fire-log")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (rateLimited(ip)) return json({ ok: false, reason: "rate_limited" }, 429);

        // Cap body size to defeat oversized spoof payloads.
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return json({ ok: false, reason: "too_large" }, 413);

        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, reason: "bad_json" }, 400);
        }

        const scope = body?.scope as "funnel" | "landing" | "platform" | undefined;
        const event_name = (body?.event_name as string | undefined)?.slice(0, 60);
        if (!scope || !event_name || !["funnel", "landing", "platform"].includes(scope)) {
          return json({ ok: false, reason: "bad_payload" }, 400);
        }

        // Strict shape on resource_id — only accept real UUIDs so we can verify ownership.
        const resourceRaw = body?.resource_id ? String(body.resource_id) : null;
        const resource_id = resourceRaw && UUID_RE.test(resourceRaw) ? resourceRaw : null;
        if (scope !== "platform" && !resource_id) {
          return json({ ok: false, reason: "bad_resource" }, 400);
        }

        const pixel_id = body?.pixel_id ? String(body.pixel_id).slice(0, 32) : null;
        const run_id = body?.run_id ? String(body.run_id).slice(0, 64) : null;
        const is_test = !!body?.is_test;
        const success = body?.success !== false;
        const ua = request.headers.get("user-agent")?.slice(0, 255) ?? null;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Resolve owner_id from the resource. If the row doesn't exist, drop the event
          // — that means someone is spoofing fire-logs for a UUID that isn't theirs.
          let owner_id: string | null = null;
          if (resource_id && scope !== "platform") {
            const table = scope === "funnel" ? "funnels" : "landing_pages";
            const { data: row } = await (supabaseAdmin as any)
              .from(table)
              .select("owner_id")
              .eq("id", resource_id)
              .maybeSingle();
            owner_id = (row as any)?.owner_id ?? null;
            if (!owner_id) {
              return json({ ok: false, reason: "unknown_resource" }, 404);
            }
          }

          const { error } = await (supabaseAdmin as any).from("pixel_fire_log").insert({
            pixel_id,
            scope,
            resource_id,
            owner_id,
            event_name,
            success,
            run_id,
            is_test,
            user_agent: ua,
          });
          if (error) {
            console.warn("[pixel/fire-log] insert failed", error.message);
            return json({ ok: false, reason: "db" }, 200);
          }
          return json({ ok: true });
        } catch (err: any) {
          console.warn("[pixel/fire-log] error", err?.message);
          return json({ ok: false, reason: "exception" }, 200);
        }
      },
    },
  },
});
