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

export const Route = createFileRoute("/api/public/pixel/fire-log")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, reason: "bad_json" }, 400);
        }

        const scope = body?.scope as "funnel" | "landing" | "platform" | undefined;
        const event_name = (body?.event_name as string | undefined)?.slice(0, 60);
        if (!scope || !event_name || !["funnel", "landing", "platform"].includes(scope)) {
          return json({ ok: false, reason: "bad_payload" }, 400);
        }

        const pixel_id = body?.pixel_id ? String(body.pixel_id).slice(0, 32) : null;
        const resource_id = body?.resource_id ? String(body.resource_id).slice(0, 64) : null;
        const run_id = body?.run_id ? String(body.run_id).slice(0, 64) : null;
        const is_test = !!body?.is_test;
        const success = body?.success !== false;
        const ua = request.headers.get("user-agent")?.slice(0, 255) ?? null;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Resolve owner_id from the resource so creators can read their own fires under RLS.
          let owner_id: string | null = null;
          if (resource_id && scope !== "platform") {
            const table = scope === "funnel" ? "funnels" : "landing_pages";
            const { data: row } = await (supabaseAdmin as any)
              .from(table)
              .select("owner_id")
              .eq("id", resource_id)
              .maybeSingle();
            owner_id = (row as any)?.owner_id ?? null;
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
