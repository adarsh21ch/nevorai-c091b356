import { Link } from "@/lib/router-compat";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, BarChart3, Users2, Radio, Layers, Video, Map } from "lucide-react";
import { useState } from "react";

const items = [
  { to: "/insights", icon: BarChart3, label: "Insights overview" },
  { to: "/insights?tab=traffic", icon: Map, label: "Traffic sources" },
  { to: "/insights?tab=attribution", icon: Users2, label: "Lead attribution" },
  { to: "/tracking", icon: Layers, label: "Team tracking" },
  { to: "/videos", icon: Video, label: "Videos" },
  { to: "/live", icon: Radio, label: "Live sessions" },
];

export const AdvancedSection = () => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border border-border bg-card/40">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-heading font-semibold text-muted-foreground">Advanced</span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3 sm:grid-cols-3">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-xs font-medium hover:bg-muted/40"
            >
              <it.icon size={14} className="text-primary" />
              <span className="truncate">{it.label}</span>
            </Link>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AdvancedSection;
