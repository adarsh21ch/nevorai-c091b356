import { Link } from "@/lib/router-compat";
import { Clock } from "lucide-react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { usePlan } from "@/hooks/usePlan";

export const TrialBanner = () => {
  const { daysRemaining, isTrialEnabled, subscriptionStatus } = useTrialStatus();
  const { plan } = usePlan();

  if (plan.isPaid) return null;
  if (!isTrialEnabled) return null;
  if (subscriptionStatus !== "trial") return null;
  if (daysRemaining === null || daysRemaining > 3) return null;

  return (
    <div className="w-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border-b border-amber-500/30 px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-2 flex-wrap">
      <Clock size={14} className="text-amber-500 shrink-0" />
      <span className="text-foreground">
        Your trial ends in <strong>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""}</strong>.
      </span>
      <Link to="/pricing" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">
        Upgrade now →
      </Link>
    </div>
  );
};
