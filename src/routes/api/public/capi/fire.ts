// Per-creator Meta Conversions API forwarder.
//
// The browser fires fbq with an event_id; the same event_id is POSTed here
// so Meta dedupes the browser + server fires. Looks up the owner's CAPI
// config via `resolve_capi_config_for_resource` (service-role only).
//
// If the owner has not enabled CAPI or has no token, returns ok:false with
// reason:"capi_disabled" — the browser pixel still fired, so this is non-fatal.
//
// Hashes em / ph / external_id with SHA-256 before sending (Meta requirement).
// Always logs the result to pixel_fire_log with scope=`<scope>` and event_name
// suffixed `_capi` so the Health Dashboard can show CAPI separately.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_BODY_BYTES = 8_192;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/capi/fire")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return json({ ok: false, reason: "too_large" }, 413);

        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, reason: "bad_json" }, 400);
        }

        const scope = body?.scope as "funnel" | "landing" | undefined;
        const eventName = (body?.event_name as string | undefined)?.slice(0, 40);
        const eventId = (body?.event_id as string | undefined)?.slice(0, 64);
        const resourceRaw = body?.resource_id ? String(body.resource_id) : null;
        const resource_id = resourceRaw && UUID_RE.test(resourceRaw) ? resourceRaw : null;

        if (!scope || !["funnel", "landing"].includes(scope) || !eventName || !eventId || !resource_id) {
          return json({ ok: false, reason: "bad_payload" }, 400);
        }

        const eventSourceUrl = (body?.event_source_url as string | undefined)?.slice(0, 2048);
        const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          null;
        const fbp = (body?.fbp as string | undefined)?.slice(0, 128);
        const fbc = (body?.fbc as string | undefined)?.slice(0, 256);
        const params = (body?.params ?? {}) as Record<string, any>;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: cfg, error: cfgErr } = await (supabaseAdmin as any).rpc(
            "resolve_capi_config_for_resource",
            { _scope: scope, _resource_id: resource_id },
          );
          if (cfgErr) {
            console.warn("[capi/fire] resolve failed", cfgErr.message);
            return json({ ok: false, reason: "resolve_failed" }, 200);
          }
          const config = Array.isArray(cfg) ? cfg[0] : cfg;
          if (!config?.access_token || !config?.pixel_id) {
            return json({ ok: false, reason: "capi_disabled" }, 200);
          }

          const user_data: Record<string, any> = {};
          if (ip) user_data.client_ip_address = ip;
          if (userAgent) user_data.client_user_agent = userAgent;
          if (fbp) user_data.fbp = fbp;
          if (fbc) user_data.fbc = fbc;
          if (params.email) user_data.em = [await sha256Hex(String(params.email))];
          if (params.phone) user_data.ph = [await sha256Hex(String(params.phone).replace(/\D/g, ""))];
          if (params.user_id) user_data.external_id = [await sha256Hex(String(params.user_id))];

          const payload: any = {
            data: [
              {
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,
                action_source: "website",
                event_source_url: eventSourceUrl,
                user_data,
                custom_data: {
                  value: params.value,
                  currency: params.currency,
                  content_name: params.content_name,
                  content_category: params.content_category,
                  content_ids: params.content_ids,
                  order_id: params.order_id,
                },
              },
            ],
          };
          if (config.test_event_code) payload.test_event_code = config.test_event_code;

          let success = false;
          let httpStatus = 0;
          let graphErr: string | null = null;
          let fbtraceId: string | null = null;
          try {
            const resp = await fetch(
              `https://graph.facebook.com/v20.0/${encodeURIComponent(config.pixel_id)}/events?access_token=${encodeURIComponent(config.access_token)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              },
            );
            httpStatus = resp.status;
            const j = await resp.json().catch(() => ({}));
            fbtraceId = j?.fbtrace_id ?? null;
            success = resp.ok && !j?.error;
            if (!success && j?.error?.message) graphErr = String(j.error.message).slice(0, 200);
          } catch (err: any) {
            graphErr = err?.message ?? "fetch_failed";
          }

          // Mirror to pixel_fire_log so the Health Dashboard sees CAPI fires.
          await (supabaseAdmin as any).from("pixel_fire_log").insert({
            pixel_id: config.pixel_id,
            scope,
            resource_id,
            owner_id: config.owner_id,
            event_name: `${eventName}_capi`,
            success,
            run_id: (body?.run_id as string | undefined)?.slice(0, 64) ?? null,
            is_test: !!body?.is_test,
            user_agent: userAgent?.slice(0, 255) ?? null,
          });

          return json({
            ok: success,
            http_status: httpStatus,
            fbtrace_id: fbtraceId,
            error: graphErr,
          });
        } catch (err: any) {
          console.warn("[capi/fire] exception", err?.message);
          return json({ ok: false, reason: "exception" }, 200);
        }
      },
    },
  },
});
