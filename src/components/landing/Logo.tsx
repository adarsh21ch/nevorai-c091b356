import logoDark from "@/assets/nevorai-mark.png";
import logoLight from "@/assets/nevorai-mark-light.png";

interface LogoProps {
  size?: "sm" | "default" | "lg";
  showByline?: boolean;
  variant?: "short" | "full";
}

export const Logo = ({ size = "default", showByline = false, variant = "short" }: LogoProps) => {
  const sizes = {
    sm: { img: "w-8 h-8", text: "text-[16px]", byline: "text-[9px]" },
    default: { img: "w-10 h-10", text: "text-[20px]", byline: "text-[10px]" },
    lg: { img: "w-14 h-14", text: "text-[26px]", byline: "text-[11px]" },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      {/* Theme-aware mark: black on light bg, white on dark bg */}
      <picture className={`${s.img} relative inline-block`}>
        <img
          src={logoDark}
          alt="Nevorai"
          className={`${s.img} object-contain block dark:hidden`}
        />
        <img
          src={logoLight}
          alt=""
          aria-hidden="true"
          className={`${s.img} object-contain hidden dark:block`}
        />
      </picture>
      <div className="flex flex-col" style={{ lineHeight: 1 }}>
        <div className={`flex items-baseline ${s.text}`} style={{ lineHeight: 1, color: "hsl(var(--foreground))" }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", letterSpacing: "-0.02em", fontWeight: 700 }}>
            Nevorai
          </span>
        </div>
        {showByline && (
          <span className={`${s.byline} mt-1`} style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 500, color: "hsl(var(--muted-foreground))", letterSpacing: "0.02em" }}>
            Share videos that get watched.
          </span>
        )}
      </div>
    </div>
  );
};
