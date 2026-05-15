// Shared slug-suffix helper.
// We append a short random base-62 suffix to every newly-generated public slug
// (funnels, landing pages, live sessions) so URLs cannot be enumerated by
// stripping a numeric "-2" tail. Existing rows are NOT migrated — breaking
// shared links would destroy user trust.

import { supabase } from "@/integrations/supabase/client";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomSuffix(length = 4): string {
  let out = "";
  // Prefer crypto when available for better entropy.
  const cryptoObj = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buf = new Uint32Array(length);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < length; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Generate a slug = `${base}-${randomSuffix}` and verify it does not collide
 * in `table.slug`. Tries up to 5 times, then falls back to an 8-char suffix.
 *
 * @param base Already cleaned base slug (lowercase, hyphenated, ≤40 chars).
 * @param table Supabase table whose `slug` column must remain unique.
 */
export async function generateUniqueSuffixedSlug(
  base: string,
  table: "funnels" | "landing_pages" | "live_sessions",
): Promise<string> {
  const trimmedBase = (base || "untitled").slice(0, 40).replace(/-+$/g, "") || "untitled";
  for (let i = 0; i < 5; i++) {
    const candidate = `${trimmedBase}-${randomSuffix(4)}`;
    const { data } = await (supabase as any)
      .from(table)
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${trimmedBase}-${randomSuffix(8)}`;
}
