import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.NEVORAI_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEVORAI_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response("Server misconfigured: missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY", { status: 500 });
    }

    const authHeader = getRequestHeader("authorization");
    if (!authHeader) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
      },
    });
  },
);
