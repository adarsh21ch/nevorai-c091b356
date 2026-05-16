import { ReactNode } from "react";
import { ArrowLeft, ExternalLink, LucideIcon } from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { LivePulseDot } from "./LivePulseDot";

export function DrillHeader({
  icon: Icon,
  title,
  subtitle,
  publicHref,
  liveCount = 0,
  actions,
  backTo,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  publicHref?: string | null;
  liveCount?: number;
  actions?: ReactNode;
  backTo?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="premium-card p-4 flex items-start gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        className="shrink-0"
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </Button>
      <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
        <Icon size={18} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-heading font-bold truncate">{title}</h1>
          {liveCount > 0 ? <LivePulseDot label={`${liveCount} live`} /> : null}
        </div>
        {subtitle ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {publicHref ? (
          <Link to={publicHref} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink size={12} /> View
            </Button>
          </Link>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

export function KpiStrip({
  cards,
}: {
  cards: Array<{ icon: LucideIcon; label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(({ icon: Icon, label, value, hint }, i) => (
        <div key={i} className="premium-card p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="stat-icon">
              <Icon size={12} className="text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</span>
          </div>
          <div className="text-lg font-heading font-bold tabular-nums">{value}</div>
          {hint ? <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
