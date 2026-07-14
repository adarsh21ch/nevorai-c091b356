/**
 * Prospect-facing screen shown when the creator's plan/access is inactive.
 * Message intentionally makes it clear this is a CREATOR subscription issue,
 * not an app outage — and asks the prospect to nudge the creator to upgrade.
 */
import { AlertCircle } from "lucide-react";

export const PlanInactiveScreen = ({
  creatorName,
  title = "Access limit reached",
}: {
  creatorName?: string | null;
  title?: string;
}) => {
  const who = creatorName?.trim() ? creatorName.trim() : "the person who shared this link";
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
          <AlertCircle size={24} className="text-amber-500" />
        </div>
        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This content is temporarily paused because{" "}
            <span className="font-medium text-foreground">{who}</span>'s current plan
            limit has ended.
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed">
            Please contact them and request an upgrade — access will be restored
            instantly once their plan is renewed.
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
