interface BrandingWatermarkProps {
  ownerId?: string | null;
  variant?: "floating" | "inline";
  theme?: "auto" | "light" | "dark";
}

/**
 * Deprecated: branding watermark removed in favor of in-player "nevorai.com"
 * watermark and the standardized footer. Kept as a no-op to preserve any
 * legacy imports without rendering anything.
 */
export const BrandingWatermark = (_props: BrandingWatermarkProps) => null;

export default BrandingWatermark;
