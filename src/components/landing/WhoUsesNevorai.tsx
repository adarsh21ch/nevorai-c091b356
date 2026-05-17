import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import { Home, Shield, Network, GraduationCap, ArrowRight } from "lucide-react";

const useCases = [
  {
    Icon: Home,
    title: "Real Estate Agents",
    body: "Share property tour videos that prospects actually watch. Track who's serious. Close more deals.",
    to: "/use-cases/real-estate",
  },
  {
    Icon: Shield,
    title: "Insurance Agents",
    body: "Send policy explainers your prospects can't skip. Qualify leads before the first call.",
    to: "/use-cases/insurance-agents",
  },
  {
    Icon: Network,
    title: "Network Marketing Leaders",
    body: "Share plan videos without losing prospects to YouTube distractions.",
    to: "/use-cases/network-marketing",
  },
  {
    Icon: GraduationCap,
    title: "Online Coaches",
    body: "Sell courses and 1:1 coaching with videos that get watched end-to-end.",
    to: "/use-cases/coaches",
  },
];

export const WhoUsesNevorai = () => {
  return (
    <section id="who-uses" className="py-20 sm:py-24 relative bg-hero-bg">
      <div className="container-app">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-extrabold text-white mb-4">
            Who uses <span className="text-gradient-brand">Nevorai?</span>
          </h2>
          <p className="text-base md:text-lg text-hero-muted">
            Built for creators who sell across every industry.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {useCases.map(({ Icon, title, body, to }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
            >
              <Link
                to={to}
                className="group block h-full rounded-2xl p-6 bg-white/[0.04] border border-white/10 hover:border-brand-emerald/40 hover:bg-white/[0.06] hover:-translate-y-1 hover:shadow-elegant transition-all duration-300"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand mb-4 shadow-elegant">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">{title}</h3>
                <p className="text-sm text-hero-muted leading-relaxed mb-4">{body}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-emerald">
                  See how
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
