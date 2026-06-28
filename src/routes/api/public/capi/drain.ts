// Drain worker for the CAPI retry queue.
//
// Called by pg_cron (every minute) with header `x-drain-secret: <CAPI_DRAIN_SECRET>`.
// Claims up to 50 pending rows via `claim_capi_fires`, re-POSTs each payload to
// Meta Graph, and marks them sent or schedules the next retry via
// `complete_capi_fire`. Service-role only — never reachable from the browser.

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-drain-secret",
} as const;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

export const Route = createFileRoute("/api/public/capi/drain")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const secret = process.env.CAPI_DRAIN_SECRET;
        if (!secret) return json({ ok: false, reason: "not_configured" }, 503);
        if (request.headers.get("x-drain-secret") !== secret) {
          return json({ ok: false, reason: "unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: claimed, error: claimErr } = await (supabaseAdmin as any).rpc(
          "claim_capi_fires",
          { _limit: 50 },
        );
        if (claimErr) return json({ ok: false, reason: "claim_failed", error: claimErr.message }, 200);

        const rows: any[] = Array.isArray(claimed) ? claimed : [];
        let sent = 0;
        let failed = 0;

        await Promise.all(
          rows.map(async (row) => {
            // Token may have been rotated/cleared since enqueue — re-resolve fresh.
            const { data: cfg } = await (supabaseAdmin as any).rpc(
              "resolve_capi_config_for_resource",
              { _scope: row.scope, _resource_id: row.resource_id },
            );
            const config = Array.isArray(cfg) ? cfg[0] : cfg;
            if (!config?.access_token || !config?.pixel_id) {
              await (supabaseAdmin as any).rpc("complete_capi_fire", {
                _id: row.id,
                _ok: false,
                _error: "capi_disabled_or_rotated",
              });
              failed++;
              return;
            }

            let ok = false;
            let errMsg: string | null = null;
            try {
              const resp = await fetch(
                `https://graph.facebook.com/v20.0/${encodeURIComponent(config.pixel_id)}/events?access_token=${encodeURIComponent(config.access_token)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(row.payload),
                },
              );
              const j = await resp.json().catch(() => ({}));
              ok = resp.ok && !j?.error;
              if (!ok) errMsg = (j?.error?.message ?? `http_${resp.status}`).slice(0, 200);
            } catch (err: any) {
              errMsg = (err?.message ?? "fetch_failed").slice(0, 200);
            }

            await (supabaseAdmin as any).rpc("complete_capi_fire", {
              _id: row.id,
              _ok: ok,
              _error: errMsg,
            });
            ok ? sent++ : failed++;
          }),
        );

        return json({ ok: true, claimed: rows.length, sent, failed });
      },
    },
  },
});
