import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanCard {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlight: boolean;
  planKey: "free" | "basic" | "pro";
}

const fallback: PlanCard[] = [
  { name: "Free", price: "₹0", period: "forever", features: ["1 GB storage", "1 funnel", "Lead capture", "WhatsApp share"], cta: "Start free →", highlight: false, planKey: "free" },
  { name: "Basic", price: "₹149", period: "/month", features: ["5 GB storage", "10 funnels", "Landing pages", "All Free perks"], cta: "Get Basic →", highlight: true, planKey: "basic" },
  { name: "Pro", price: "₹1,499", period: "/month", features: ["50 GB storage", "Unlimited funnels", "Live sessions", "Speaker profile", "Advanced analytics", "All Basic perks"], cta: "Get Pro →", highlight: false, planKey: "pro" },
];

const fmtStorageGB = (mb: number | null | undefined) => {
  if (mb == null) return null;
  if (mb === -1) return "Unlimited storage";
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB storage`;
  }
  return `${mb} MB storage`;
};

const buildFeatures = (cfg: any, includeAllOf?: string): string[] => {
  if (!cfg) return [];
  const f: string[] = [];
  const storage = fmtStorageGB(cfg.max_storage_mb);
  if (storage) f.push(storage);
  if (cfg.max_funnels === -1) f.push("Unlimited funnels");
  else if (cfg.max_funnels > 0) f.push(`${cfg.max_funnels} funnel${cfg.max_funnels === 1 ? "" : "s"}`);
  if (cfg.feature_lead_capture) f.push("Lead capture");
  if (cfg.feature_whatsapp_share || cfg.feature_video_sharing) f.push("WhatsApp share");
  if (cfg.feature_landing_pages) f.push("Landing pages");
  if (cfg.feature_go_live) f.push("Live sessions");
  if (cfg.feature_speaker_profile) f.push("Speaker profile");
  if (cfg.feature_advanced_analytics || cfg.feature_prospect_analytics) f.push("Advanced analytics");
  if (includeAllOf) f.push(`All ${includeAllOf} perks`);
  return f;
};

export const Pricing = () => {
  const navigate = useNavigate();

  const { data: configs } = useQuery({
    queryKey: ["nv2-plan-configs"],
    queryFn: async () => {
      const { data } = await supabase.from("plan_config").select("*");
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });

  let cards: PlanCard[] = fallback;
  if (configs && configs.length) {
    const free = configs.find((c: any) => c.plan_name === "free");
    const basic = configs.find((c: any) => c.plan_name === "basic");
    const pro = configs.find((c: any) => c.plan_name === "pro");
    const next: PlanCard[] = [];
    if (free) next.push({
      name: "Free", price: "₹0", period: "forever",
      features: buildFeatures(free).slice(0, 5),
      cta: "Start free →", highlight: false, planKey: "free",
    });
    if (basic) next.push({
      name: "Basic",
      price: `₹${Number(basic.price_inr_monthly ?? 149).toLocaleString("en-IN")}`,
      period: "/month",
      features: buildFeatures(basic, "Free").slice(0, 6),
      cta: "Get Basic →", highlight: true, planKey: "basic",
    });
    if (pro) next.push({
      name: "Pro",
      price: `₹${Number(pro.price_inr_monthly ?? 1499).toLocaleString("en-IN")}`,
      period: "/month",
      features: buildFeatures(pro, "Basic").slice(0, 7),
      cta: "Get Pro →", highlight: false, planKey: "pro",
    });
    if (next.length === 3) cards = next;
  }

  const onClick = (p: PlanCard) => {
    if (p.planKey === "free") navigate("/auth?tab=signup");
    else navigate(`/auth?tab=signup&plan=${p.planKey}&redirect=/billing`);
  };

  return (
    <section id="pricing" className="py-24 md:py-32 bg-[var(--nv2-bg-2)]">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#0A0A0A]">
            Simple pricing. No surprises.
          </h2>
          <p className="mt-4 text-lg text-[var(--nv2-muted)]">
            Start free. Upgrade when you outgrow it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {cards.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative rounded-2xl border bg-white p-8 flex flex-col",
                p.highlight
                  ? "border-2 border-[var(--nv2-accent)]"
                  : "border-[var(--nv2-border)]",
              )}
            >
              {p.highlight && (
                <span className="absolute -top-3 right-6 rounded-full bg-[var(--nv2-accent)] px-3 py-1 text-xs font-medium text-white">
                  POPULAR
                </span>
              )}
              <div>
                <h3 className="text-xl font-semibold text-[#0A0A0A]">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-[#0A0A0A]">{p.price}</span>
                  <span className="text-sm text-[var(--nv2-muted)]">{p.period}</span>
                </div>
              </div>
              <ul className="mt-8 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-[#0A0A0A]">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[var(--nv2-accent)]" strokeWidth={2} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onClick(p)}
                className={cn(
                  "mt-10 w-full rounded-full px-6 py-3 text-sm font-medium transition-colors min-h-11",
                  p.highlight
                    ? "bg-[var(--nv2-accent)] text-white hover:bg-orange-600"
                    : "border border-[var(--nv2-border)] text-[#0A0A0A] hover:bg-[var(--nv2-bg-2)]",
                )}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
