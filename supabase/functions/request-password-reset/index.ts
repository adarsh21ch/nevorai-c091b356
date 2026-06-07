const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_ORIGIN = Deno.env.get("PUBLIC_APP_URL") || "https://nevorai.com";
const RESEND_FROM = "Nevorai <noreply@nevorai.com>";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const wrap = (inner: string) => `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <tr><td>
        <div style="font-size:13px;font-weight:700;letter-spacing:0.2em;color:#2563eb;margin-bottom:24px;">NEVORAI</div>
        ${inner}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;"/>
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
          Nevorai · <a href="${SITE_ORIGIN}" style="color:#94a3b8;text-decoration:underline;">nevorai.com</a><br/>
          Same effort. Twice the conversion.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;margin:8px 0 20px;">${esc(label)} →</a>`;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, reason: `Method ${req.method} not allowed` }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[password-reset-edge] missing Supabase env");
    return json({ ok: true });
  }

  let payload: { email?: string } | null = null;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: true });
  }

  const email = String(payload?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json({ ok: true });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const redirectTo = `${SITE_ORIGIN.replace(/\/+$/, "")}/reset-password`;
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkErr) {
      const msg = String(linkErr?.message || "").toLowerCase();
      if (!msg.includes("not found") && !msg.includes("user_not_found")) {
        console.error("[password-reset-edge] generateLink failed", linkErr);
      }
      return json({ ok: true });
    }

    const actionLink = linkData?.properties?.action_link ?? linkData?.action_link;
    if (!actionLink) {
      console.error("[password-reset-edge] no action_link in generateLink result");
      return json({ ok: true });
    }

    let name: string | undefined;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("email", email)
        .maybeSingle();
      if (profile?.full_name) name = profile.full_name as string;
    } catch {
      // ignore best-effort name lookup
    }

    const greeting = name ? `Hi ${esc(name)},` : "Hi there,";
    const html = wrap(`
      <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#2563eb;margin-bottom:10px;">PASSWORD RESET</div>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 14px;line-height:1.3;">Reset your Nevorai password</h1>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px;">We received a request to reset your Nevorai password. Click the button below to choose a new one. This link expires in 1 hour.</p>
      ${button(actionLink, "Reset Password")}
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:10px 0 0;">If the button doesn't work, copy and paste this link into your browser:<br/><span style="word-break:break-all;color:#475569;">${esc(actionLink)}</span></p>
      <p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:18px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `);

    const gmailRes = await fetch(`${supabaseUrl}/functions/v1/send-gmail-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        to: email,
        subject: "Reset your Nevorai password",
        html,
        sender_name: "Nevorai",
      }),
    });

    if (gmailRes.ok) {
      const gmailJson = await gmailRes.json().catch(() => ({}));
      if (gmailJson?.sent) {
        console.log("[password-reset-edge] gmail send ok", gmailJson?.message_id);
        return json({ ok: true });
      }
    }

    const gmailText = await gmailRes.text().catch(() => "");
    console.warn("[password-reset-edge] gmail send failed, trying resend", gmailRes.status, gmailText);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[password-reset-edge] RESEND_API_KEY missing for fallback");
      return json({ ok: true });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: "Reset your Nevorai password",
        html,
      }),
    });

    if (!resendRes.ok) {
      const resendText = await resendRes.text().catch(() => "");
      console.error("[password-reset-edge] resend fallback failed", resendRes.status, resendText);
      return json({ ok: true });
    }

    const resendJson = await resendRes.json().catch(() => ({}));
    console.log("[password-reset-edge] resend send ok", resendJson?.id);
    return json({ ok: true });
  } catch (err) {
    console.error("[password-reset-edge] unexpected error", err);
    return json({ ok: true });
  }
});