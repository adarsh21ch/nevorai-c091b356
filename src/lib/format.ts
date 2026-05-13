/**
 * Display formatting helpers for currency, counts, and dates.
 * Keep purely presentational — never use the output for math.
 */

/** Indian Rupee with grouping. e.g. 1299 -> "₹1,299" */
export function formatINR(n: number | null | undefined, opts?: { decimals?: number }): string {
  if (n == null || Number.isNaN(Number(n))) return "₹0";
  const decimals = opts?.decimals ?? 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(n));
}

/** Compact counts. 1234 -> "1.2K", 1500000 -> "1.5M" */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "0";
  const v = Number(n);
  if (Math.abs(v) < 1000) return String(v);
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

/** Plain integer with thousands grouping (Indian style). */
export function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return new Intl.NumberFormat("en-IN").format(Math.round(Number(n)));
}
