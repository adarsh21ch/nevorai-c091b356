import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  label?: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Single source of truth for the "Views" label across the product.
 * Views = unique people. Same person opening N times counts ONCE.
 * The info tooltip is the user-visible explanation of that rule.
 */
export const ViewsLabel = ({ label = "Views", className, iconClassName }: Props) => {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span>{label}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What counts as a view?"
              className="inline-flex items-center opacity-70 hover:opacity-100 transition-opacity"
            >
              <Info size={12} className={iconClassName} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
            Number of unique people who watched. Same person opening it multiple times counts once.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
};
