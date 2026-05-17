import { motion } from "framer-motion";
import { Link } from "@/lib/router-compat";
import {
  Check, X, Lock, UserPlus, MessageCircle, Workflow, Radio, Globe,
  Rocket, Building2, Users, Link as LinkIcon, Twitter, Instagram, Linkedin,
} from "lucide-react";
import { Nav } from "./Nav";
import { Pricing } from "./Pricing";
import { FAQ } from "./FAQ";
import { LogoMark } from "./Logo";

const Section = ({
  children,
  className = "",
  id,
}: { children: React.ReactNode; className?: string; id?: string }) => (
  <motion.section
    id={id}
    className={className}
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.6, ease: "easeOut" }}
  >
    {children}
  </motion.section>
);

const headlineWords = ["Same", "effort.", "Twice", "the", "conversion."];

export const LandingV2 = () => {
  return (
    <div className="landing-v2 min-h-screen bg-white text-[#0A0A0A] antialiased">
      <Nav />

      {/* HERO */}
      <section className="px-6 md:px-8 pt-20 pb-20 md:pt-32 md:pb-32">
        <div className="mx-auto max-w-6xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--nv2-bg-2)] text-xs text-[var(--nv2-muted)] border border-[var(--nv2-border)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--nv2-accent)]" />
            Built in India for creators who sell
          </motion.span>

          <h1 className="mt-8 text-5xl sm:text-6xl md:text-7xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
            {headlineWords.map((w, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08, ease: "easeOut" }}
                className={i >= 2 ? "text-[var(--nv2-accent)]" : ""}
              >
                {w}{" "}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="mt-6 text-lg md:text-xl text-[var(--nv2-muted)] max-w-2xl mx-auto leading-relaxed"
          >
            Stop losing leads to YouTube recommendations. Share your video on a link that only plays your video — and captures every viewer as a lead.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.85 }}
            className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center"
          >
            <Link
              to="/auth?tab=signup"
              className="w-full sm:w-auto rounded-full bg-[var(--nv2-accent)] px-6 py-3 text-base font-medium text-white hover:bg-orange-600 transition-colors min-h-11 inline-flex items-center justify-center"
            >
              Start free →
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto rounded-full border border-[var(--nv2-border)] px-6 py-3 text-base font-medium hover:bg-[var(--nv2-bg-2)] transition-colors min-h-11 inline-flex items-center justify-center"
            >
              See how it works
            </a>
          </motion.div>

          <p className="mt-4 text-xs text-[var(--nv2-muted)]">Free forever · No credit card</p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="mt-20 md:mt-24 mx-auto max-w-4xl"
          >
            <div className="rounded-2xl border border-[var(--nv2-border)] shadow-sm overflow-hidden bg-[var(--nv2-bg-2)] aspect-[16/10] flex items-center justify-center">
              <div className="text-center px-6">
                <LogoMark size={48} withWordmark={false} />
                <p className="mt-4 text-sm text-[var(--nv2-muted)]">
                  Your video. Your link. Your funnel.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PROBLEM/SOLUTION */}
      <Section className="px-6 md:px-8 py-24 md:py-32 bg-[var(--nv2-bg-2)]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Sharing on YouTube costs you leads.
            </h2>
            <p className="mt-4 text-lg text-[var(--nv2-muted)]">
              Every link to a YouTube video is an invitation to leave. Nevorai keeps every viewer in your funnel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            <div className="rounded-2xl border border-[var(--nv2-border)] bg-white p-8">
              <h3 className="text-xl font-semibold mb-6">YouTube</h3>
              <ul className="space-y-4">
                {[
                  "Viewer sees recommended videos",
                  "Algorithm pushes competitor content",
                  "Ads break your message",
                  "Lead never enters your funnel",
                  "Public link, no tracking",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-[#0A0A0A]/80">
                    <X className="h-5 w-5 mt-0.5 shrink-0 text-red-500" strokeWidth={1.5} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-8">
              <h3 className="text-xl font-semibold mb-6">Nevorai</h3>
              <ul className="space-y-4">
                {[
                  "Only your video plays",
                  "No \"Up next\" panel",
                  "No ads, ever",
                  "Lead capture built in",
                  "Per-lead analytics",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-[#0A0A0A]">
                    <Check className="h-5 w-5 mt-0.5 shrink-0 text-orange-600" strokeWidth={2} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* PERSONAS */}
      <Section className="px-6 md:px-8 py-24 md:py-32 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Built for creators who sell.
            </h2>
            <p className="mt-4 text-lg text-[var(--nv2-muted)]">
              Whether you're closing high-ticket clients or running affiliate campaigns, Nevorai works for your funnel.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { Icon: Rocket, title: "Entrepreneurs", body: "Pitch your offer on a single link that captures every lead." },
              { Icon: Building2, title: "Startup Founders", body: "Demo your product without sending prospects to YouTube tabs." },
              { Icon: Users, title: "Network Marketers", body: "Recruit and train your downline with trackable videos." },
              { Icon: LinkIcon, title: "Affiliate Marketers", body: "Promote offers with conversion-optimised landing pages." },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--nv2-border)] bg-white p-6 transition-all duration-200 md:hover:scale-[1.01] md:hover:border-orange-200"
              >
                <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-orange-50">
                  <Icon className="h-6 w-6 text-[var(--nv2-accent)]" strokeWidth={1.5} />
                </span>
                <h3 className="text-lg font-semibold mt-4">{title}</h3>
                <p className="text-sm text-[var(--nv2-muted)] mt-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features" className="px-6 md:px-8 py-24 md:py-32 bg-[var(--nv2-bg-2)]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Everything you need to convert.
            </h2>
            <p className="mt-4 text-lg text-[var(--nv2-muted)]">
              Six tools, one platform, zero friction.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { Icon: Lock, title: "Locked Playback", body: "No skipping. No ads. Viewers watch what you intended." },
              { Icon: UserPlus, title: "Lead Capture", body: "Trigger a form mid-video to capture intent at peak attention." },
              { Icon: MessageCircle, title: "WhatsApp Share", body: "One-tap share with rich previews on WhatsApp, India's #1 channel." },
              { Icon: Workflow, title: "Funnels", body: "Sequence multiple videos with conditional CTAs." },
              { Icon: Radio, title: "Live Sessions", body: "Stream webinars with the same lead-capture engine." },
              { Icon: Globe, title: "Landing Pages", body: "Pair your video with a custom landing page in 60 seconds." },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-[var(--nv2-border)] bg-white p-6 transition-all duration-200 md:hover:scale-[1.01] md:hover:border-orange-200"
              >
                <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-orange-50">
                  <Icon className="h-6 w-6 text-[var(--nv2-accent)]" strokeWidth={1.5} />
                </span>
                <h3 className="text-lg font-semibold mt-4">{title}</h3>
                <p className="text-sm text-[var(--nv2-muted)] mt-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* STATS */}
      <Section className="px-6 md:px-8 py-24 md:py-32 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              The numbers tell the story.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "0%", l: "viewer drop-off to other content" },
              { n: "2×", l: "lead conversion uplift" },
              { n: "100%", l: "Indian-built for Indian creators" },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-[var(--nv2-border)] bg-[var(--nv2-bg-2)] p-10 text-center"
              >
                <div className="text-5xl md:text-6xl font-semibold text-[var(--nv2-accent)]">{s.n}</div>
                <p className="text-sm text-[var(--nv2-muted)] mt-3 leading-relaxed">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Pricing />
      <FAQ />

      {/* FINAL CTA */}
      <Section className="px-6 md:px-8 py-24 md:py-32 bg-[var(--nv2-bg-2)]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight">
            Stop losing leads to YouTube.
          </h2>
          <p className="mt-4 text-lg text-[var(--nv2-muted)]">
            Start with Nevorai today. Free forever.
          </p>
          <div className="mt-10">
            <Link
              to="/auth?tab=signup"
              className="inline-flex items-center justify-center rounded-full bg-[var(--nv2-accent)] px-8 py-4 text-base font-medium text-white hover:bg-orange-600 transition-colors min-h-11"
            >
              Start free →
            </Link>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="bg-[var(--nv2-bg-2)] border-t border-[var(--nv2-border)] py-16 px-6 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            <div className="col-span-2 md:col-span-1">
              <LogoMark size={28} />
              <p className="text-sm text-[var(--nv2-muted)] mt-4 leading-relaxed">
                Share videos that get watched. Built in India.
              </p>
            </div>
            {[
              { title: "Product", items: [["Pricing", "#pricing"], ["Features", "#features"], ["FAQ", "#faq"]] },
              { title: "Company", items: [["About", "/about"], ["Contact", "/contact"]] },
              { title: "Legal", items: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refund", "/refund-policy"]] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--nv2-muted)] mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-3">
                  {col.items.map(([label, href]) => (
                    <li key={label}>
                      {href.startsWith("/") ? (
                        <Link to={href} className="text-sm text-[#0A0A0A] hover:text-[var(--nv2-accent)] transition-colors">
                          {label}
                        </Link>
                      ) : (
                        <a href={href} className="text-sm text-[#0A0A0A] hover:text-[var(--nv2-accent)] transition-colors">
                          {label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 pt-8 border-t border-[var(--nv2-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[var(--nv2-muted)]">
              © {new Date().getFullYear()} Nevorai · All rights reserved
            </p>
            <div className="flex items-center gap-4">
              {[
                { Icon: Twitter, href: "https://twitter.com" },
                { Icon: Instagram, href: "https://instagram.com/nevoraiflow" },
                { Icon: Linkedin, href: "https://linkedin.com" },
              ].map(({ Icon, href }) => (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="text-[var(--nv2-muted)] hover:text-[#0A0A0A] transition-colors">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingV2;
