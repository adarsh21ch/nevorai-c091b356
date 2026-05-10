export async function hashAccessCode(raw: string): Promise<string> {
  const normalized = String(raw || "").trim().toUpperCase();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
