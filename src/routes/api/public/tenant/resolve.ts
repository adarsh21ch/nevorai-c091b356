// Public tenant-resolution endpoint.
// GET /api/public/tenant/resolve?host=<host>  →  ResolvedTenant | null
//
// Bypasses auth (sits under /api/public/*) and returns only safe public
// branding columns. The browser typically does NOT call this directly —
// the TenantProvider on the server resolves the tenant from the incoming
// Host header during SSR. This route exists so the client can re-resolve
// after a soft navigation (e.g. dev `?tenant=` override) and so external
// tools can debug host → workspace mapping.
import { createFileRoute } from "@tanstack/react-router";
import { resolveTenant } from "@/lib/tenant.functions";

export const Route = createFileRoute("/api/public/tenant/resolve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const host = url.searchParams.get("host") ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
        if (!host) return Response.json({ error: "missing host" }, { status: 400 });
        const tenant = await resolveTenant({ data: { host } });
        return Response.json(tenant, {
          headers: { "cache-control": "public, max-age=30, s-maxage=60" },
        });
      },
    },
  },
});
