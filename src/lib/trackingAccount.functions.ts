// Client-callable server functions for the signed-in user's CAPI / tracking config.
// - getMyTrackingAccount() returns a MASKED projection (no raw token).
// - saveMyTrackingAccount() upserts; pass `access_token: undefined` to keep
//   the existing token, '' to clear it, or a new string to overwrite.
// - sendCapiTestEvent() fires a real test event to Meta Graph using the
//   caller's saved token and writes the result back to tracking_accounts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TrackingAccountView = {
  pixel_id: string | null;
  test_event_code: string | null;
  capi_enabled: boolean;
  advanced_matching_enabled: boolean;
  has_access_token: boolean;
  access_token_preview: string | null;
  last_test_at: string | null;
  last_test_status: "ok" | "error" | null;
  last_test_response: any;
  updated_at: string | null;
};

export const getMyTrackingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrackingAccountView | null> => {
    const supabase = (context as any).supabase;
    const { data, error } = await supabase.rpc("get_my_tracking_account");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return row as TrackingAccountView;
  });

const SaveInput = z.object({
  pixel_id: z.string().trim().max(32).nullable().optional(),
  // undefined = keep, '' = clear, string = replace
  access_token: z.string().max(512).nullable().optional(),
  test_event_code: z.string().trim().max(40).nullable().optional(),
  capi_enabled: z.boolean(),
  advanced_matching_enabled: z.boolean(),
});

export const saveMyTrackingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    // Translate undefined -> null at the RPC boundary so PG receives the
    // "keep existing token" signal correctly.
    const tokenArg =
      data.access_token === undefined ? null : data.access_token === null ? "" : data.access_token;

    const { error } = await supabase.rpc("upsert_my_tracking_account", {
      _pixel_id: data.pixel_id ?? "",
      _access_token: tokenArg,
      _test_event_code: data.test_event_code ?? "",
      _capi_enabled: data.capi_enabled,
      _advanced_matching_enabled: data.advanced_matching_enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============================================================================
// Test event: fire a real PageView (or specified event) to Meta CAPI using the
// caller's saved token. Returns the literal Graph API response so the user can
// see "events_received: 1" or the exact validation error.
// ============================================================================

const TestInput = z.object({
  event_name: z.string().min(1).max(40).default("PageView"),
  event_source_url: z.string().url().optional(),
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const sendCapiTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TestInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: rowErr } = await (supabaseAdmin as any)
      .from("tracking_accounts")
      .select("pixel_id, access_token, test_event_code")
      .eq("owner_id", userId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (!row?.pixel_id) {
      return { ok: false, reason: "missing_pixel_id" as const };
    }
    if (!row?.access_token) {
      return { ok: false, reason: "missing_access_token" as const };
    }

    const eventId = crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);

    // Get user email for advanced matching (improves match quality in Meta).
    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const user_data: Record<string, string | string[]> = {
      external_id: [await sha256Hex(userId)],
    };
    if (profile?.email) user_data.em = [await sha256Hex(String(profile.email))];

    const payload: any = {
      data: [
        {
          event_name: data.event_name,
          event_time: eventTime,
          event_id: eventId,
          action_source: "website",
          event_source_url: data.event_source_url || "https://nevorai.com/test",
          user_data,
          custom_data: { test_origin: "nevorai_capi_test" },
        },
      ],
    };
    if (row.test_event_code) payload.test_event_code = row.test_event_code;

    const t0 = Date.now();
    let httpStatus = 0;
    let graphJson: any = null;
    let graphErr: string | null = null;
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(row.pixel_id)}/events?access_token=${encodeURIComponent(row.access_token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      httpStatus = resp.status;
      graphJson = await resp.json().catch(() => ({}));
    } catch (err: any) {
      graphErr = err?.message ?? "fetch_failed";
    }
    const latencyMs = Date.now() - t0;

    const ok = !graphErr && httpStatus >= 200 && httpStatus < 300 && !graphJson?.error;
    const status = ok ? "ok" : "error";

    await (supabaseAdmin as any).rpc("write_tracking_test_result", {
      _owner_id: userId,
      _status: status,
      _response: {
        http_status: httpStatus,
        latency_ms: latencyMs,
        event_id: eventId,
        graph: graphJson,
        error: graphErr,
        sent_with_test_code: !!row.test_event_code,
      },
    });

    return {
      ok,
      http_status: httpStatus,
      latency_ms: latencyMs,
      event_id: eventId,
      graph: graphJson,
      error: graphErr,
      events_received: graphJson?.events_received ?? null,
      fbtrace_id: graphJson?.fbtrace_id ?? null,
      test_event_code_used: row.test_event_code ?? null,
    };
  });
