// =============================================================================
// Tenant resolution — Phase 0
// =============================================================================
// Given a Host header, returns the workspace + branding tuple for that
// subdomain. Falls back to the "legacy" workspace for the marketing/main
// domains (nevorai.com, flow.nevorai.com, *.lovable.app, localhost) so that
// every existing code path sees a stable workspace_id from day one.
//
// This is a PUBLIC server function — it must not require auth and must not
// return PII. It only reads the narrow `workspaces` + `workspace_branding`
// columns needed to render branding.
// =============================================================================
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export type TenantBranding = {
  app_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  theme_color: string | null;
  email_from_name: string | null;
};

export type ResolvedTenant = {
  workspace_id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "pending" | "deleted";
  plan: string;
  branding: TenantBranding;
  is_legacy: boolean;
};

// Hosts that always resolve to the "legacy" workspace regardless of
// subdomain. Anything not on `*.nevorai.com` (or matching one of these
// suffixes) is treated as the marketing/main app.
const LEGACY_HOST_SUFFIXES = [
  "nevorai.com",       // bare apex + flow./www.
  "nevorai.in",
  "lovable.app",       // staging
  "lovable.dev",
  "lovableproject.com",
  "localhost",
];

const RESERVED_LEGACY_SUBDOMAINS = new Set([
  "www", "app", "flow", "nflow", "ncall", "nevorai", "admin",
  "api", "mail", "static", "cdn", "auth", "login", "signup",
]);

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").trim();
}

function extractWorkspaceSlug(host: string): { slug: string | null; legacy: boolean } {
  const h = normalizeHost(host);
  // Localhost / IP / staging → legacy
  if (!LEGACY_HOST_SUFFIXES.some((s) => h === s || h.endsWith("." + s))) {
    return { slug: null, legacy: true };
  }
  // Only *.nevorai.com may carry a workspace subdomain in Phase 0.
  if (!h.endsWith(".nevorai.com")) return { slug: null, legacy: true };
  const sub = h.slice(0, -".nevorai.com".length);
  if (!sub || sub.includes(".")) return { slug: null, legacy: true }; // bare apex or deep subdomain
  if (RESERVED_LEGACY_SUBDOMAINS.has(sub)) return { slug: null, legacy: true };
  return { slug: sub, legacy: false };
}

// Tiny in-memory LRU cache (server worker memory). 60s TTL is enough — admin
// changes are rare and the cost of a 1-minute stale branding read is low.
type CacheEntry = { value: ResolvedTenant | null; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheGet(key: string): ResolvedTenant | null | undefined {
  const e = CACHE.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { CACHE.delete(key); return undefined; }
  return e.value;
}
function cacheSet(key: string, value: ResolvedTenant | null) {
  if (CACHE.size > 500) {
    // crude eviction: drop the oldest insertion
    const firstKey = CACHE.keys().next().value;
    if (firstKey) CACHE.delete(firstKey);
  }
  CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function publicClient() {
  // Untyped client until Supabase types regenerate to include the new
  // workspaces tables (the Phase 0 migration adds them).
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

type WorkspaceRow = {
  id: string; slug: string; name: string;
  status: ResolvedTenant["status"]; plan: string;
};
type BrandingRow = TenantBranding;

async function fetchWorkspaceBySlug(slug: string): Promise<ResolvedTenant | null> {
  try {
    const supabase = publicClient();
    const { data: ws, error } = await supabase
      .from("workspaces")
      .select("id, slug, name, status, plan")
      .eq("slug", slug.toLowerCase())
      .is("deleted_at", null)
      .eq("status", "active")
      .maybeSingle();
    // Table may not exist yet (Phase 0 migration not applied) — fail soft.
    if (error) return null;
    const wsRow = ws as WorkspaceRow | null;
    if (!wsRow) return null;

    const { data: branding } = await supabase
      .from("workspace_branding")
      .select("app_name, logo_url, favicon_url, primary_color, secondary_color, theme_color, email_from_name")
      .eq("workspace_id", wsRow.id)
      .maybeSingle();
    const brandingRow = branding as BrandingRow | null;

    return {
      workspace_id: wsRow.id,
      slug: wsRow.slug,
      name: wsRow.name,
      status: wsRow.status,
      plan: wsRow.plan,
      is_legacy: wsRow.slug === "legacy",
      branding: brandingRow ?? {
        app_name: wsRow.name, logo_url: null, favicon_url: null,
        primary_color: null, secondary_color: null, theme_color: null,
        email_from_name: null,
      },
    };
  } catch {
    return null;
  }
}

export const resolveTenant = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ host: z.string().min(1).max(253) }).parse(input),
  )
  .handler(async ({ data }) => {
    const host = normalizeHost(data.host);
    const cached = cacheGet(host);
    if (cached !== undefined) return cached;

    const { slug, legacy } = extractWorkspaceSlug(host);
    const targetSlug = legacy ? "legacy" : slug!;

    const resolved = await fetchWorkspaceBySlug(targetSlug);

    // If a real subdomain didn't resolve, fall back to legacy so the app
    // doesn't blank out. Phase 5 will render a proper "unknown workspace"
    // page; in Phase 0 we never want behaviour to change for existing users.
    const finalValue =
      resolved ?? (legacy ? null : await fetchWorkspaceBySlug("legacy"));

    cacheSet(host, finalValue);
    return finalValue;
  });

// Server-runtime helper: read the request host and resolve the tenant in one
// call. Used by __root.tsx loader so the SSR/CSR boundary doesn't need to
// pass `host` around. Returns null on any failure — Phase 0 must never
// break the app if the migration hasn't been applied.
export const getCurrentTenant = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { getRequestHeader, getRequestHost } = await import(
        "@tanstack/react-start/server"
      );
      const host =
        getRequestHeader("x-forwarded-host") ??
        getRequestHeader("host") ??
        getRequestHost() ??
        "";
      if (!host) return null;
      const normalized = normalizeHost(host);
      const cached = cacheGet(normalized);
      if (cached !== undefined) return cached;
      const { slug, legacy } = extractWorkspaceSlug(normalized);
      const targetSlug = legacy ? "legacy" : slug!;
      const resolved = await fetchWorkspaceBySlug(targetSlug);
      const finalValue =
        resolved ?? (legacy ? null : await fetchWorkspaceBySlug("legacy"));
      cacheSet(normalized, finalValue);
      return finalValue;
    } catch {
      return null;
    }
  },
);
