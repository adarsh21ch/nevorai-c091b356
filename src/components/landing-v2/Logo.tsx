import logoSrc from "@/assets/logo-n-dot.png";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export const LogoMark = ({ size = 32, withWordmark = true, className }: LogoProps) => {
  return (
    <div className={cn("inline-flex items-center gap-2 group", className)}>
      <span
        className="relative inline-flex shrink-0 transition-transform duration-700 ease-out md:group-hover:rotate-[360deg]"
        style={{ width: size, height: size }}
      >
        <img
          src={logoSrc}
          alt="Nevorai"
          width={size}
          height={size}
          className="h-full w-full object-contain"
        />
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-[#0A0A0A] nv2-dot-pulse"
          style={{
            width: size * 0.14,
            height: size * 0.14,
            top: size * 0.22,
            right: size * 0.24,
          }}
        />
      </span>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-[#0A0A0A]">
          Nevorai
        </span>
      )}
    </div>
  );
};

export default LogoMark;
