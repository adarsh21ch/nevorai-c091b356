import { supabase } from "@/integrations/supabase/client";

/**
 * Admin writes occasionally race with Supabase's token refresh and the SDK
 * sends the publishable (anon) key as the bearer. When that happens, RLS
 * silently blocks UPDATE/DELETE (PostgREST returns 204 but 0 rows change) and
 * INSERT loudly fails with "new row violates row-level security policy".
 *
 * This helper guarantees a fresh user JWT is attached, then retries once if
 * the first attempt looks like it was rejected by RLS.
 */
export async function ensureAuthedSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return true;
  const refreshed = await supabase.auth.refreshSession();
  return !!refreshed.data.session?.access_token;
}

type WriteResult<T> = { data: T | null; error: Error | null };

/**
 * Run a Supabase write and verify it returned rows. If the first call returns
 * an empty result (silent RLS) or an RLS error, refresh the session and retry
 * once before surfacing the error.
 */
export async function adminWrite<T>(
  fn: () => PromiseLike<{ data: T[] | null; error: any }>,
  opts: { expectRows?: boolean } = {},
): Promise<WriteResult<T[]>> {
  const expectRows = opts.expectRows !== false;
  await ensureAuthedSession();

  let res = await fn();

  const looksBlocked =
    !!res.error?.message?.toLowerCase?.().includes("row-level security") ||
    (expectRows && !res.error && (!res.data || res.data.length === 0));

  if (looksBlocked) {
    await supabase.auth.refreshSession();
    res = await fn();
  }

  if (res.error) return { data: null, error: new Error(res.error.message) };
  if (expectRows && (!res.data || res.data.length === 0)) {
    return {
      data: null,
      error: new Error(
        "Save blocked by access control. Please refresh the page and re-login as admin.",
      ),
    };
  }
  return { data: res.data ?? null, error: null };
}
