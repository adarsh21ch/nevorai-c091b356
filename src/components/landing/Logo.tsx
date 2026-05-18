import logoDark from "@/assets/nevorai-mark.png";
import logoLight from "@/assets/nevorai-mark-light.png";

interface LogoProps {
  size?: "sm" | "default" | "lg";
  showByline?: boolean;
  variant?: "short" | "full";
  /**
   * Logo color behavior:
   * - "auto" (default): black on light theme, white on dark theme (uses .dark class)
   * - "light": force white mark (use on dark backgrounds)
   * - "dark": force black mark (use on light backgrounds)
   */
  tone?: "auto" | "light" | "dark";
}

export const Logo = ({ size = "default", showByline = false, variant = "short", tone = "auto" }: LogoProps) => {
  const sizes = {
    sm: { img: "w-8 h-8", text: "text-[16px]", byline: "text-[9px]" },
    default: { img: "w-10 h-10", text: "text-[20px]", byline: "text-[10px]" },
    lg: { img: "w-14 h-14", text: "text-[26px]", byline: "text-[11px]" },
  };
  const s = sizes[size];

  const textColor =
    tone === "light" ? "#ffffff" : tone === "dark" ? "#0b0b0b" : "hsl(var(--foreground))";
  const bylineColor =
    tone === "light" ? "rgba(255,255,255,0.7)" : tone === "dark" ? "rgba(0,0,0,0.6)" : "hsl(var(--muted-foreground))";

  const renderMark = () => {
    if (tone === "light") {
      return <img src={logoLight} alt="Nevorai" className={`${s.img} object-contain`} />;
    }
    if (tone === "dark") {
      return <img src={logoDark} alt="Nevorai" className={`${s.img} object-contain`} />;
    }
    return (
      <>
        <img src={logoDark} alt="Nevorai" className={`${s.img} object-contain block dark:hidden`} />
        <img src={logoLight} alt="" aria-hidden="true" className={`${s.img} object-contain hidden dark:block`} />
      </>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {renderMark()}
      <div className="flex flex-col" style={{ lineHeight: 1 }}>
        <div className={`flex items-baseline ${s.text}`} style={{ lineHeight: 1, color: textColor }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", letterSpacing: "-0.02em", fontWeight: 700 }}>
            Nevorai
          </span>
        </div>
        {showByline && (
          <span className={`${s.byline} mt-1`} style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 500, color: bylineColor, letterSpacing: "0.02em" }}>
            Share videos that get watched.
          </span>
        )}
      </div>
    </div>
  );
};
