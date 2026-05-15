import { useLandingContent } from "@/hooks/useLandingContent";
import skipImg from "@/assets/landing/section-2-skip-button.jpg";
import noSkipImg from "@/assets/landing/section-3-no-skip.jpg";
import unknownImg from "@/assets/landing/section-4-unknown-viewers.jpg";
import realtimeImg from "@/assets/landing/section-5-realtime-activity.jpg";
import clutterImg from "@/assets/landing/section-6-youtube-clutter.jpg";
import cleanImg from "@/assets/landing/section-7-clean-player.jpg";
import youtubeFlow from "@/assets/landing/section-8-youtube-flow.jpg";
import nevoraiFlow from "@/assets/landing/section-8-nevorai-flow.jpg";

const FALLBACKS: { id: string; src: string; alt: string }[] = [
  { id: "story.no-skip",   src: noSkipImg,   alt: "Unskippable player" },
  { id: "story.realtime",  src: realtimeImg, alt: "Real-time viewer activity" },
  { id: "compare.nevorai", src: nevoraiFlow, alt: "Nevorai conversion flow" },
  { id: "story.clean",     src: cleanImg,    alt: "Clean full-screen player" },
  { id: "story.skip",      src: skipImg,     alt: "Skip button on YouTube" },
  { id: "story.unknown",   src: unknownImg,  alt: "Unknown viewers" },
  { id: "story.clutter",   src: clutterImg,  alt: "YouTube clutter" },
  { id: "compare.youtube", src: youtubeFlow, alt: "YouTube leaky flow" },
];

/**
 * Auto-scrolling, infinitely-looping image strip for the hero.
 * Replaces the static stat tiles. Uses the latest admin-uploaded landing
 * images when available (falls back to bundled assets).
 */
export const HeroMarquee = () => {
  const { data } = useLandingContent();
  const map = data?.map ?? {};
  const items = FALLBACKS.map((f) => ({
    src: map[f.id]?.image_url || f.src,
    alt: f.alt,
  }));
  // Duplicate for seamless loop
  const loop = [...items, ...items];

  return (
    <div className="hero-marquee relative w-full max-w-5xl overflow-hidden mask-fade-x">
      <div className="hero-marquee-track flex gap-4 w-max">
        {loop.map((it, i) => (
          <div
            key={i}
            className="shrink-0 h-20 md:h-24 aspect-[3/4] rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10 shadow-elegant"
          >
            <img
              src={it.src}
              alt={it.alt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
};
