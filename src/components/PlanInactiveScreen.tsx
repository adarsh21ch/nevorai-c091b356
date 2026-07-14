/**
 * Prospect-facing screen shown when the creator's plan/access is inactive.
 * Copy is admin-editable via `app_settings.prospect_gate_title` and
 * `app_settings.prospect_gate_message`.
 */
import { AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TITLE = "Access limit reached";
const DEFAULT_MESSAGE =
  "This content is temporarily paused because the creator's current plan limit has ended. Please contact them and request an upgrade — access will be restored instantly once their plan is renewed.";

const useProspectGateCopy = () =>
  useQuery({
    queryKey: ["app-settings-prospect-gate"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("key, value")
        .in("key", ["prospect_gate_title", "prospect_gate_message"]);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        map[r.key] = r.value;
      });
      return {
        title: map.prospect_gate_title || DEFAULT_TITLE,
        message: map.prospect_gate_message || DEFAULT_MESSAGE,
      };
    },
  });

export const PlanInactiveScreen = ({
  creatorName,
  title,
}: {
  creatorName?: string | null;
  title?: string;
}) => {
  const { data: copy } = useProspectGateCopy();
  const who = creatorName?.trim() ? creatorName.trim() : "the person who shared this link";
  const finalTitle = title || copy?.title || DEFAULT_TITLE;
  const finalMessage = copy?.message || DEFAULT_MESSAGE;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
          <AlertCircle size={24} className="text-amber-500" />
        </div>
        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{finalTitle}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {finalMessage.replace(/\bthe creator\b/i, who)}
          </p>
        </div>
        <div className="pt-4">
          <a
            href="https://nevorai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Powered by Nevorai
          </a>
        </div>
      </div>
    </div>
  );
};

export default PlanInactiveScreen;
