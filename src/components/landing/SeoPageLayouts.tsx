import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Check, X, ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface UseCaseContent {
  hero: { eyebrow: string; titleStart: string; titleAccent: string; subtitle: string };
  problem: { title: string; paragraphs: string[] };
  solution: { title: string; bullets: { heading: string; body: string }[] };
  workflow: { title: string; steps: { title: string; body: string }[] };
  faq: { q: string; a: string }[];
  related: { to: string; label: string }[];
  ctaLabel?: string;
}

export const UseCasePage = ({ content }: { content: UseCaseContent }) => {
  const { hero, problem, solution, workflow, faq, related } = content;
  return (
    <div data-theme="dark" className="min-h-screen bg-hero-bg text-white">
      <Navbar />

      <section className="pt-32 pb-12">
        <div className="container-app max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 bg-brand-emerald/10 border border-brand-emerald/30"
          >
            <span className="text-xs font-medium text-brand-emerald">{hero.eyebrow}</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-heading font-extrabold tracking-tight mb-5 leading-tight"
          >
            {hero.titleStart} <span className="gradient-text">{hero.titleAccent}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8"
          >
            {hero.subtitle}
          </motion.p>
          <Link to="/auth?tab=signup">
            <Button size="xl" className="rounded-full text-white font-semibold border-0 bg-gradient-brand shadow-glow-brand-lg px-10 py-4">
              {content.ctaLabel ?? "Get Started — 7-Day Refund"}
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-3">🇮🇳 Made in India · Built for network marketers</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container-app max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-6">{problem.title}</h2>
          <div className="space-y-4">
            {problem.paragraphs.map((p, i) => (
              <p key={i} className="text-muted-foreground leading-relaxed">{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-8 text-center">{solution.title}</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {solution.bullets.map((b) => (
              <div key={b.heading} className="glass-card p-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-emerald/10 flex items-center justify-center flex-shrink-0">
                    <Check className="text-brand-emerald" size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-heading font-semibold mb-2">{b.heading}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-8">{workflow.title}</h2>
          <ol className="space-y-6">
            {workflow.steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-base font-heading font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-6 text-center">Frequently asked</h2>
          <Accordion type="single" collapsible className="space-y-3">
            {faq.map((f, i) => (
              <AccordionItem key={i} value={`f-${i}`} className="glass-card px-6 border-white/[0.06]">
                <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-4 text-left">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-4">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-4">Ready to share videos that get watched?</h2>
          <p className="text-muted-foreground mb-6">Plans start at ₹249/mo. 7-day refund window. Setup in under 2 minutes.</p>
          <Link to="/auth?tab=signup">
            <Button size="xl" className="rounded-full text-white font-semibold border-0 bg-gradient-brand shadow-glow-brand-lg px-10 py-4">
              {content.ctaLabel ?? "Get Started — 7-Day Refund"}
            </Button>
          </Link>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {related.map((r) => (
              <Link key={r.to} to={r.to} className="inline-flex items-center gap-1 text-sm text-brand-emerald hover:underline">
                {r.label} <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export interface CompareRow {
  feature: string;
  nevorai: string | true | false;
  other: string | true | false;
}

export interface CompareContent {
  competitor: string;
  hero: { titleStart: string; titleAccent: string; subtitle: string };
  intro: string[];
  rows: CompareRow[];
  whyParagraphs: { title: string; body: string }[];
  honest: string;
  faq: { q: string; a: string }[];
}

const cell = (v: string | true | false) => {
  if (v === true) return <Check className="text-brand-emerald inline" size={18} />;
  if (v === false) return <X className="text-red-400 inline" size={18} />;
  return <span className="text-sm">{v}</span>;
};

export const ComparePage = ({ content }: { content: CompareContent }) => {
  const { competitor, hero, intro, rows, whyParagraphs, honest, faq } = content;
  return (
    <div data-theme="dark" className="min-h-screen bg-hero-bg text-white">
      <Navbar />

      <section className="pt-32 pb-12">
        <div className="container-app max-w-4xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-heading font-extrabold tracking-tight mb-5 leading-tight"
          >
            {hero.titleStart} <span className="gradient-text">{hero.titleAccent}</span>
          </motion.h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">{hero.subtitle}</p>
          <Link to="/auth?tab=signup">
            <Button size="xl" className="rounded-full text-white font-semibold border-0 bg-gradient-brand shadow-glow-brand-lg px-10 py-4">
              Try Nevorai
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-12">
        <div className="container-app max-w-3xl space-y-4">
          {intro.map((p, i) => (
            <p key={i} className="text-muted-foreground leading-relaxed">{p}</p>
          ))}
        </div>
      </section>

      <section className="py-12 border-t border-border-subtle/10">
        <div className="container-app max-w-4xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-6 text-center">
            Nevorai vs {competitor} — feature by feature
          </h2>
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-4 text-sm font-semibold">Feature</th>
                  <th className="p-4 text-sm font-semibold text-brand-emerald">Nevorai</th>
                  <th className="p-4 text-sm font-semibold text-muted-foreground">{competitor}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature} className="border-b border-white/5 last:border-0">
                    <td className="p-4 text-sm">{r.feature}</td>
                    <td className="p-4">{cell(r.nevorai)}</td>
                    <td className="p-4 text-muted-foreground">{cell(r.other)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-8">Why this matters for Indian business</h2>
          <div className="space-y-6">
            {whyParagraphs.map((p) => (
              <div key={p.title}>
                <h3 className="text-base font-heading font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl">
          <div className="glass-card p-6">
            <h3 className="text-base font-heading font-semibold mb-2">Honest take — when {competitor} is still the right pick</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{honest}</p>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-6 text-center">Frequently asked</h2>
          <Accordion type="single" collapsible className="space-y-3">
            {faq.map((f, i) => (
              <AccordionItem key={i} value={`c-${i}`} className="glass-card px-6 border-white/[0.06]">
                <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-4 text-left">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-4">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="py-16 border-t border-border-subtle/10">
        <div className="container-app max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-4">See the difference yourself.</h2>
          <p className="text-muted-foreground mb-6">Plans start at ₹249/mo. 7-day refund window. Setup in under 2 minutes.</p>
          <Link to="/auth?tab=signup">
            <Button size="xl" className="rounded-full text-white font-semibold border-0 bg-gradient-brand shadow-glow-brand-lg px-10 py-4">
              Get Started with Nevorai
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};
