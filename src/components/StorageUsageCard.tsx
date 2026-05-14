import { Progress } from "@/components/ui/progress";
import { Link } from "@/lib/router-compat";
import { HardDrive, ArrowRight } from "lucide-react";
import { useStorageUsage } from "@/hooks/useStorageUsage";

export const StorageUsageCard = () => {
  const { usedGB, limitGB, percent, isOverLimit, planName, isLoading } = useStorageUsage();
  if (isLoading) return null;
  const isFree = planName === "free";
  return (
    <div className="premium-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="stat-icon">
            <HardDrive size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-sm">Storage</h3>
            <p className="text-[11px] text-muted-foreground capitalize">{planName} plan</p>
          </div>
        </div>
        <div className="text-sm font-medium tabular-nums">
          <span className={isOverLimit ? "text-destructive" : "text-foreground"}>
            {usedGB.toFixed(2)}
          </span>
          <span className="text-muted-foreground"> / {limitGB.toFixed(1)} GB</span>
        </div>
      </div>
      <Progress value={percent} className="h-2" />
      {(isFree || isOverLimit) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {isOverLimit ? "You've reached your storage limit." : "Upgrade for more storage."}
          </p>
          <Link to="/pricing" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            Upgrade <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
};

export const StorageUsageInline = () => {
  const { usedGB, limitGB, isOverLimit, isLoading } = useStorageUsage();
  if (isLoading) return null;
  return (
    <span className={`text-xs tabular-nums ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
      {usedGB.toFixed(2)} / {limitGB.toFixed(1)} GB used
    </span>
  );
};
