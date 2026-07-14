import { Link } from "@/lib/router-compat";
import { Clock } from "lucide-react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { usePlan } from "@/hooks/usePlan";

/**
 * Every non-paying user is now on a 7-day trial (see leader plan migration).
 * We show a trial notification for the full duration — colour intensifies
 * as it nears expiry.
 */
export const TrialBanner = () => {
  const { daysRemaining, isTrialEnabled, subscriptionStatus } = useTrialStatus();
  const { plan } = usePlan();

  if (plan.isPaid) return null;
  if (!isTrialEnabled) return null;
  if (subscriptionStatus !== "trial") return null;
  if (daysRemaining === null) return null;

  const urgent = daysRemaining <= 3;
  const wrap = urgent
    ? "from-red-500/15 to-amber-500/15 border-red-500/30"
    : "from-emerald-500/12 to-blue-500/12 border-emerald-500/25";
  const iconColor = urgent ? "text-red-500" : "text-emerald-500";
  const cta = urgent ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div
      className={`w-full bg-gradient-to-r ${wrap} border-b px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-2 flex-wrap`}
    >
      <Clock size={14} className={`${iconColor} shrink-0`} />
      <span className="text-foreground">
        {daysRemaining > 0 ? (
          <>
            You're on a <strong>7-day free trial</strong> — full access · {" "}
            <strong>
              {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} left
            </strong>
          </>
        ) : (
          <>Your free trial ends today.</>
        )}
      </span>
      <Link to="/pricing" className={`${cta} font-semibold hover:underline`}>
        Upgrade now →
      </Link>
    </div>
  );
};
