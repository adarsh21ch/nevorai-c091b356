import { cn } from "@/lib/utils";

interface NFlowLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  variant?: "default" | "white" | "dark";
  className?: string;
}

export const NFlowLogo = ({
  size = "md",
  showTagline = false,
  variant = "default",
  className,
}: NFlowLogoProps) => {
  const sizeMap = {
    xs: { name: "text-sm", by: "text-[9px]", tag: "text-[9px]" },
    sm: { name: "text-base", by: "text-[10px]", tag: "text-[10px]" },
    md: { name: "text-lg", by: "text-[11px]", tag: "text-[11px]" },
    lg: { name: "text-2xl", by: "text-xs", tag: "text-xs" },
    xl: { name: "text-4xl", by: "text-sm", tag: "text-sm" },
  } as const;

  const s = sizeMap[size];

  const textColor =
    variant === "white" || variant === "dark" ? "text-white" : "text-foreground";
  const subColor = variant === "white" ? "text-white/70" : "text-muted-foreground";

  return (
    <div className={cn("flex flex-col leading-tight select-none", className)}>
      <span className={cn("font-heading font-bold tracking-tight", textColor, s.name)}>
        Nevorai
      </span>
      {showTagline && (
        <span className={cn("mt-1 font-normal leading-snug", s.tag, subColor)}>
          Share videos that get watched.
        </span>
      )}
    </div>
  );
};

export default NFlowLogo;
