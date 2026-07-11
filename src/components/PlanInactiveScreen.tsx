/**
 * Neutral "link temporarily unavailable" screen shown to PROSPECTS when the
 * creator's plan is inactive (e.g. Free tier disabled, subscription lapsed).
 *
 * Intentionally does NOT mention plans, billing, or blame the creator — the
 * prospect just sees a soft "check back soon". A tiny "Powered by nFlow"
 * link is the only branding.
 */
import { Clock } from "lucide-react";

export const PlanInactiveScreen = ({ title = "This link is temporarily unavailable" }: { title?: string }) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Clock size={22} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The person who shared this link will be back soon. Please check again in a little while.
          </p>
        </div>
        <div className="pt-4">
          <a
            href="https://nevorai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Powered by nFlow
          </a>
        </div>
      </div>
    </div>
  );
};

export default PlanInactiveScreen;
