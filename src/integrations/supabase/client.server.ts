import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy admin client — instantiating at module load throws when SSR runs in an
// environment without service-role env vars, which crashes EVERY page (the
// route module is pulled into the server bundle even if no one calls it).
let _admin: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  // Prefer Lovable-managed SUPABASE_* (when Lovable Cloud is on); otherwise fall
  // back to project-defined NEVORAI_SUPABASE_* secrets (external Supabase project).
  const url = process.env.SUPABASE_URL || process.env.NEVORAI_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEVORAI_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or NEVORAI_SUPABASE_URL / NEVORAI_SUPABASE_SERVICE_ROLE_KEY) in server env",
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

// Proxy so existing `supabaseAdmin.from(...)` call sites keep working without
// changes — the real client is built on first property access.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getAdmin() as any)[prop];
  },
});
