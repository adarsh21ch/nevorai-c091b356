import logoMark from "@/assets/nevorai-logo-mark.png";

/**
 * Nevorai logo mark — user-provided artwork. Do not restyle.
 * Uses CSS filter to invert in dark mode so it adapts to theme,
 * preserving the original shape exactly.
 */
export const LogoMark = ({ className = "" }: { className?: string }) => (
  <img
    src={logoMark}
    alt="Nevorai"
    className={`logo-mark-img object-contain ${className}`}
    draggable={false}
  />
);
