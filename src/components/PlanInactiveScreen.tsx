/**
 * Neutral "video temporarily paused" screen shown to PROSPECTS when the
 * creator's plan/access is inactive. Intentionally does NOT mention plans,
 * billing, "free tier", or ask the prospect to chase the creator.
 */
import { Clock } from "lucide-react";

export const PlanInactiveScreen = ({
  creatorName,
  title = "This video isn't available right now",
}: {
  creatorName?: string | null;
  title?: string;
}) => {
  const who = creatorName?.trim() ? creatorName.trim() : "the person who shared this";
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Clock size={22} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The content shared by <span className="font-medium text-foreground">{who}</span> is
            paused at the moment. Please check back a little later.
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
