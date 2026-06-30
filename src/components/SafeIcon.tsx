import { Circle } from "lucide-react";
import type { ElementType } from "react";

type IconProps = {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
};

type SafeIconProps = IconProps & {
  icon?: ElementType<IconProps> | null;
  fallback?: ElementType<IconProps>;
};

export function SafeIcon({ icon, fallback: Fallback = Circle, ...props }: SafeIconProps) {
  const Icon: ElementType<IconProps> = typeof icon === "function" || (typeof icon === "object" && icon !== null)
    ? icon
    : Fallback;

  return <Icon {...props} />;
}