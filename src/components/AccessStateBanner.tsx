import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { AlertTriangle, XOctagon, X } from "lucide-react";
import { useAccessState } from "@/hooks/useAccessState";

const DISMISS_KEY = "nflow.access_grace_dismissed_until";
const DISMISS_HOURS = 6;

/**
 * Creator-facing banner shown when their own access is in "grace" or "blocked".
 * The grace banner is dismissible for a few hours; the blocked banner is
 * non-dismissible so they can't miss it.
 */
export const AccessStateBanner = () => {
  const { state, graceEndsAt, isLoading } = useAccessState();
  const [tick, setTick] = useState(0);

  if (isLoading || state === "active") return null;

  const now = Date.now();
  const dismissedUntil =
    typeof window !== "undefined" ? Number(localStorage.getItem(DISMISS_KEY) || 0) : 0;

  if (state === "grace") {
    if (dismissedUntil > now) return null;
    const dateStr = graceEndsAt
      ? graceEndsAt.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "soon";
    return (
      <div className="mx-3 mt-3 sm:mx-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-100">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0 text-sm leading-relaxed">
          <div className="font-semibold">Your free access is ending</div>
          <div className="text-xs opacity-90 mt-0.5">
            Your shared videos will stop playing for your prospects on{" "}
            <strong>{dateStr}</strong>. Upgrade now to keep them live.
          </div>
        </div>
        <Link
          to="/billing"
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
        >
          Upgrade
        </Link>
        <button
          onClick={() => {
            localStorage.setItem(
              DISMISS_KEY,
              String(Date.now() + DISMISS_HOURS * 3_600_000)
            );
            setTick((t) => t + 1);
          }}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // blocked — non-dismissible
  void tick;
  return (
    <div className="mx-3 mt-3 sm:mx-4 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-900 dark:text-red-100">
      <XOctagon size={18} className="mt-0.5 shrink-0 text-red-500" />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        <div className="font-semibold">Your videos are no longer playing for your prospects</div>
        <div className="text-xs opacity-90 mt-0.5">
          Upgrade to reactivate them instantly.
        </div>
      </div>
      <Link
        to="/billing"
        className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
      >
        Upgrade
      </Link>
    </div>
  );
};

export default AccessStateBanner;
