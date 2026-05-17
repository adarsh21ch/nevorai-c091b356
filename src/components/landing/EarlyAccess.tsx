import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const cards = [
  {
    quote:
      "Built to fix the #1 problem with sharing videos to prospects: nobody watches the whole thing, and you have no way to know who did.",
    name: "Adarsh",
    role: "Founder of Nevorai",
    initials: "A",
  },
  {
    quote:
      "YouTube was built for entertainment. Vimeo was built for filmmakers. Nevorai is built for one thing: helping creators turn videos into customers.",
    name: "The Nevorai Team",
    role: "Product",
    initials: "N",
  },
  {
    quote:
      "Every feature exists because we asked: does this help a creator close more deals from their videos? If not, we don't build it.",
    name: "The Nevorai Team",
    role: "Engineering",
    initials: "N",
  },
];

export const EarlyAccess = () => {
  return (
    <section className="py-20 sm:py-24 relative bg-hero-bg">
      <div className="container-app max-w-6xl">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-extrabold text-white mb-4">
            Join the first wave of creators using <span className="text-gradient-brand">Nevorai.</span>
          </h2>
          <p className="text-base md:text-lg text-hero-muted">
            Built in India 🇮🇳 for creators who sell — coaches, founders, marketers, and agencies launching with us.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {cards.map((c, i) => (
            <motion.div
              key={i}
              className="relative rounded-2xl p-6 flex flex-col h-full bg-white/[0.04] border border-white/10 hover:border-brand-blue/40 transition-colors"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Quote className="absolute top-5 right-5 h-6 w-6 text-brand-emerald/30" />
              <p className="text-sm md:text-base text-hero-soft leading-relaxed flex-1">
                "{c.quote}"
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-elegant">
                  {c.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{c.name}</div>
                  <div className="text-xs text-hero-muted">{c.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
