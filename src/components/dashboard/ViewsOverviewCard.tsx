import { Link } from "@/lib/router-compat";
import { Crown, AlertTriangle, ArrowRight } from "lucide-react";
import { useMonthlyViews } from "@/hooks/useMonthlyViews";
import { useDailyViews } from "@/hooks/useDailyViews";
import { useOwnerUniquePeople, useUniquePeopleTrend } from "@/hooks/useUniquePeople";
import { usePlan } from "@/hooks/usePlan";
import { planDisplay } from "@/config/planDisplay";

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Compact 2-row views overview.
 * Row 1: plan chip · today's unique-people number (hero) · 3 trend stats inline · insights link
 * Row 2: (only when a quota applies) single thin usage bar — either the tightest or daily-first.
 */
export const ViewsOverviewCard = () => {
  const { plan } = usePlan();
  const monthly = useMonthlyViews();
  const daily = useDailyViews();
  const todayPeople = useOwnerUniquePeople("today");
  const trend = useUniquePeopleTrend();
  const display = planDisplay(plan.tier);

  const dayPct = daily.isUnlimited ? 0 : daily.percent;
  const monthPct = monthly.isUnlimited ? 0 : monthly.pct;

  // Prefer the tightest quota — that's what the user hits first.
  const meter = !daily.isUnlimited && (daily.isUnlimited === monthly.isUnlimited ? dayPct >= monthPct : true)
    ? { label: "Daily limit", used: daily.used, limit: daily.limit, pct: dayPct, grad: "from-violet-500 to-purple-500" }
    : !monthly.isUnlimited
      ? { label: "Monthly limit", used: monthly.used, limit: monthly.limit, pct: monthPct, grad: "from-emerald-500 to-blue-500" }
      : null;

  const stats = [
    { label: "Today", value: todayPeople.total, primary: true },
    { label: "Yesterday", value: trend.yesterday },
    { label: "7 days", value: trend.last7 },
    { label: "30 days", value: trend.last30 },
  ];

  return (
    <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-accent/[0.03]">
      {/* ROW 1 — everything on one line on desktop, wraps cleanly on mobile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-1.5 shrink-0">
          <Crown size={12} className="text-primary" />
          <span className="text-[11px] font-semibold">{display.name}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${display.badgeClass}`}>
            {plan.isPaid ? "ACTIVE" : plan.tier === "trial" ? "TRIAL" : "FREE"}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-around gap-3 min-w-0">
          {stats.map((s) => (
            <Link
              key={s.label}
              to="/insights"
              className="flex flex-col items-center gap-0 px-1 min-w-0 hover:opacity-80 transition-opacity"
            >
              <span className={`font-heading font-extrabold tracking-tight leading-none ${s.primary ? "text-2xl sm:text-3xl text-foreground" : "text-lg sm:text-xl text-foreground/80"}`}>
                {fmt(s.value)}
              </span>
              <span className="mt-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
            </Link>
          ))}
        </div>

        <Link to="/insights" className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0">
          Insights <ArrowRight size={11} />
        </Link>
      </div>

      {/* ROW 2 — single thin quota meter, only when relevant */}
      {meter && (
        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2">
          <span className="text-[10px] font-medium text-muted-foreground shrink-0">{meter.label}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full bg-gradient-to-r ${meter.grad} transition-all`} style={{ width: `${Math.min(meter.pct, 100)}%` }} />
          </div>
          <span className="text-[10px] font-semibold tabular-nums shrink-0">{fmt(meter.used)}/{fmt(meter.limit)}</span>
        </div>
      )}

      {/* Limit alerts — kept slim */}
      {!daily.isUnlimited && dayPct >= 100 && (
        <Link
          to="/billing?upgrade=views"
          className="flex items-center justify-between gap-2 border-t border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/15"
        >
          <span className="flex items-center gap-1.5"><AlertTriangle size={11} /> Daily limit reached</span>
          <span className="flex items-center gap-1">Get more <ArrowRight size={11} /></span>
        </Link>
      )}
      {!daily.isUnlimited && dayPct >= 80 && dayPct < 100 && (
        <Link
          to="/billing?upgrade=views"
          className="flex items-center justify-between gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/15"
        >
          <span className="flex items-center gap-1.5"><AlertTriangle size={11} /> {dayPct}% of daily limit used</span>
          <span className="flex items-center gap-1">Get more <ArrowRight size={11} /></span>
        </Link>
      )}
    </section>
  );
};
