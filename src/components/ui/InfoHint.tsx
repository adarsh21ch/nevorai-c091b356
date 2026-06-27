import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  children: React.ReactNode;
  /** Optional short label above the explanation. */
  title?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Tiny "(i)" info button that opens a popover with a plain-language
 * explanation. Use next to any form label that needs context for
 * non-technical creators.
 */
export function InfoHint({ children, title, side = "top", className = "" }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors align-middle ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-72 text-xs leading-relaxed p-3">
        {title && <div className="font-semibold text-sm mb-1">{title}</div>}
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
