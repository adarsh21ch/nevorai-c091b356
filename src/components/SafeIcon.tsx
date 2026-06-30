import { Circle } from "lucide-react";
import type { ComponentType } from "react";

type IconProps = {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
};

type SafeIconProps = IconProps & {
  icon?: ComponentType<IconProps> | null;
  fallback?: ComponentType<IconProps>;
};

export function SafeIcon({ icon, fallback: Fallback = Circle, ...props }: SafeIconProps) {
  const Icon = typeof icon === "function" || (typeof icon === "object" && icon !== null)
    ? icon
    : Fallback;

  return <Icon {...props} />;
}