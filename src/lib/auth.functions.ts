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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const siteOrigin =
        process.env.SITE_URL ||
        process.env.VITE_SITE_URL ||
        "https://nevorai.com";
      const redirectTo = `${siteOrigin.replace(/\/+$/, "")}/reset-password`;

      // Generate the recovery action link. This returns the same token-bearing
      // URL Supabase would have emailed itself, so /reset-password (which already
      // reads access_token/refresh_token from the URL hash) consumes it as-is.
      const { data: linkData, error: linkErr } =
        await (supabaseAdmin as any).auth.admin.generateLink({
          type: "recovery",
          email: data.email,
          options: { redirectTo },
        });

      if (linkErr) {
        // user_not_found is expected for unknown emails — don't log loudly.
        const msg = String(linkErr?.message || "").toLowerCase();
        if (!msg.includes("not found") && !msg.includes("user_not_found")) {
          console.error("[password-reset] generateLink failed", linkErr);
        }
        return { ok: true };
      }

      const actionLink: string | undefined =
        linkData?.properties?.action_link ?? linkData?.action_link;
      if (!actionLink) {
        console.error("[password-reset] no action_link in generateLink result");
        return { ok: true };
      }

      // Look up display name (best-effort).
      let name: string | undefined;
      try {
        const { data: profile } = await (supabaseAdmin as any)
          .from("profiles")
          .select("full_name")
          .eq("email", data.email)
          .maybeSingle();
        if (profile?.full_name) name = profile.full_name as string;
      } catch {
        // ignore — name is optional
      }

      // Send through our own transport (Gmail → Resend fallback).
      const sendUrl = `${siteOrigin.replace(/\/+$/, "")}/api/public/email/send`;
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "password_reset",
          to: data.email,
          name,
          action_link: actionLink,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[password-reset] email send route failed", res.status, text);
      }
    } catch (err: any) {
      console.error("[password-reset] unexpected error", err?.message || err);
    }
    return { ok: true };
  });
