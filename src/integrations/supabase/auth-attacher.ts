// Client-side function middleware that attaches the current Supabase
// session bearer token to every server-fn call, so server fns guarded by
// `requireSupabaseAuth` can authenticate the caller.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        return next({
          sendContext: {},
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // fall through with no header
    }
    return next();
  },
);
