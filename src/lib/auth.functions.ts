import { createServerFn } from "@tanstack/react-start";

// Request a password reset email. We mint the Supabase recovery link
// server-side via the admin API and email it through our own transport
// (Gmail first, Resend fallback) — bypassing Supabase's rate-limited
// default SMTP that was silently dropping reset emails.
//
// Always returns { ok: true } regardless of whether the email exists,
// to prevent account enumeration. Real errors are logged server-side.
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => {
    const email = String(data?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("invalid_email");
    return { email };
  })
  .handler(async ({ data }) => {
    try {
      const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        "https://dnyjlmtiliqkpxwsgqyn.supabase.co";

      const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[password-reset] edge function failed", res.status, text);
        return { ok: false };
      }
    } catch (err: any) {
      console.error("[password-reset] unexpected error", err?.message || err);
      return { ok: false };
    }
    return { ok: true };
  });
