import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import youtubeFlow from "@/assets/landing/section-8-youtube-flow.jpg";
import nevoraiFlow from "@/assets/landing/section-8-nevorai-flow.jpg";

type Mode = "youtube" | "nevorai";

const data: Record<Mode, {
  header: string;
  subHeader: string;
  image: string;
  bullets: string[];
  accent: string;
}> = {
  youtube: {
    header: "❌ YouTube Route → 6–8% conversion",
    subHeader: "Share link → opens YouTube → distractions → leaves without buying.",
    image: youtubeFlow,
    bullets: [
      "Viewers see 5+ suggested videos",
      "Comments distract them",
      "Autoplay confuses them",
      "Most leave before your pitch ends",
    ],
    accent: "text-destructive",
  },
  nevorai: {
    header: "✅ Nevorai Route → 16–18% conversion",
    subHeader: "Share link → opens Nevorai → watches full video → captures lead → converts.",
    image: nevoraiFlow,
    bullets: [
      "Can't skip, so they watch",
      "Zero distractions, stays focused",
      "Automatic lead capture",
      "Follow-up scheduled instantly",
    ],
    accent: "text-brand-emerald",
  },
};

export const ResultsComparison = () => {
  const [mode, setMode] = useState<Mode>("nevorai");
  const d = data[mode];

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden bg-hero-bg">
      <div className="container-app relative z-10">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-heading font-extrabold text-white text-3xl md:text-5xl leading-[1.1] mb-4">
            Same prospect.{" "}
            <span className="text-gradient-brand">2x the conversion.</span>
          </h2>
          <p className="text-hero-muted text-base md:text-lg">
            Here's what changes when you use Nevorai instead of YouTube:
          </p>
        </motion.div>

        {/* Toggle */}
        <div className="sticky top-20 z-20 flex justify-center mb-8">
          <div
            role="tablist"
            className="inline-flex p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"
          >
            {(["youtube", "nevorai"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-5 sm:px-7 py-2.5 rounded-full text-sm font-semibold transition-all",
                  mode === m
                    ? m === "nevorai"
                      ? "bg-gradient-brand text-white shadow-glow-brand"
                      : "bg-destructive/90 text-white"
                    : "text-white/70 hover:text-white",
                )}
              >
                {m === "youtube" ? "📊 YouTube Route" : "✅ Nevorai Route"}
              </button>
            ))}
          </div>
        </div>

        {/* Panel */}
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10 backdrop-blur-md"
            >
              <h3 className={cn("font-heading font-bold text-xl md:text-2xl mb-2", d.accent)}>
                {d.header}
              </h3>
              <p className="text-hero-muted text-sm md:text-base mb-6">{d.subHeader}</p>

              <div className="rounded-xl overflow-hidden ring-1 ring-white/10 mb-8">
                <img
                  src={d.image}
                  alt={`${mode} conversion flow`}
                  width={1280}
                  height={640}
                  loading="lazy"
                  className="w-full h-auto block"
                />
              </div>

              <ul className="grid sm:grid-cols-2 gap-3">
                {d.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-sm md:text-base text-white/85"
                  >
                    <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", mode === "nevorai" ? "bg-brand-emerald" : "bg-destructive")} />
                    {b}
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
