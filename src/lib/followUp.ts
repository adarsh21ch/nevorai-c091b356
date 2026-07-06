// Small helpers for the follow-up flow.

export function formatDropoff(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function watchedPercent(
  watchPos: number | null | undefined,
  maxPos: number | null | undefined,
  duration: number | null | undefined,
): number {
  const reached = Math.max(watchPos || 0, maxPos || 0);
  if (!duration || duration <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((reached / duration) * 100)));
}

export type Heat = "hot" | "warm" | "cold";
export function heatOf(pct: number, ctaClicked: boolean): Heat {
  if (ctaClicked || pct >= 70) return "hot";
  if (pct >= 30) return "warm";
  return "cold";
}

/** Build a wa.me URL with pre-filled Hinglish nudge. */
export function waLink(phone: string | null | undefined, videoTitle?: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d]/g, "");
  if (clean.length < 8) return null;
  const withCC = clean.length === 10 ? `91${clean}` : clean;
  const msg = videoTitle
    ? `Hi! Aapne "${videoTitle}" dekha — koi doubt ho toh batao, main help kar deta hoon.`
    : `Hi! Aapne video dekha — koi doubt ho toh batao.`;
  return `https://wa.me/${withCC}?text=${encodeURIComponent(msg)}`;
}

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, "");
  return clean.length >= 8 ? `tel:${clean}` : null;
}
