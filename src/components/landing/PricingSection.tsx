import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, X, Info, Loader2, Sparkles, ArrowUp } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Carousel, CarouselApi, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { useNevoraiMember } from "@/hooks/useNevoraiMember";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSupabaseFunctionErrorMessage } from "@/lib/supabase-function-error";

// Trial system disabled. Free tier is the new entry point.


const VIEWS_TOOLTIP = "Total unique viewers across all your funnels per day. Resets at midnight IST.";

const FREE_CTA = "Get Started";
const FREE_VARIANT = "outline" as const;

/**
 * Build the Free-plan feature list entirely from the admin `subscription_plans` row.
 * Always shows: marketplace + public content + Nevorai video link (constant
 * platform capabilities). Everything else is driven by DB so admin edits to
 * max_funnels / daily_view_limit / feature_* immediately reflect
 * on the public pricing card.
 */
const buildFreeFeatures = (config: any): { text: string; included: boolean; tooltip?: string }[] => {
  const items: { text: string; included: boolean; tooltip?: string }[] = [];

  // Funnels (only show if creation is allowed AND at least 1 funnel)
  if (config?.feature_funnel_creation !== false) {
    if (config?.max_funnels === -1) items.push({ text: "Unlimited funnels", included: true });
    else if ((config?.max_funnels ?? 0) > 0) items.push({ text: `Create up to ${config.max_funnels} funnel${config.max_funnels === 1 ? "" : "s"}`, included: true });
  }

  // Video uploads — storage is the only quota, so we just advertise the capability.
  if (config?.feature_video_upload) {
    items.push({ text: "Upload videos (limited only by your storage)", included: true });
  }

  // Always-on platform capabilities for free users
  items.push({ text: "Add videos via Nevorai Video Link", included: true });

  // Daily view limit
  const dv = formatDailyViews(config?.daily_view_limit);
  if (dv) items.push({ text: dv.text, included: true, tooltip: dv.tooltip });

  items.push({ text: "Access public content", included: true });
  items.push({ text: "Browse marketplace", included: true });

  // Negative feature flags — show as crossed out so users see what's gated
  // Lead capture & live broadcast temporarily hidden from pricing UI



  return items;
};

const formatStorage = (mb: number | null | undefined): string | null => {
  if (mb == null) return null;
  if (mb === -1) return "Unlimited storage";
  if (mb <= 0) return null;
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB storage`;
  }
  return `${mb} MB storage`;
};

const formatDailyViews = (limit: number | null | undefined): { text: string; tooltip: string } | null => {
  if (limit == null) return null;
  if (limit === -1) return { text: "Unlimited daily views", tooltip: VIEWS_TOOLTIP };
  if (limit <= 0) return null;
  return { text: `${limit.toLocaleString("en-IN")} views/day total`, tooltip: VIEWS_TOOLTIP };
};

const buildFeatures = (config: any) => {
  const features: { text: string; included: boolean; tooltip?: string }[] = [];

  // Funnels
  if (config.max_funnels === -1) features.push({ text: "Unlimited funnels", included: true });
  else if (config.max_funnels > 0) features.push({ text: `Up to ${config.max_funnels} funnels`, included: true });

  // Landing pages
  if (config.feature_landing_pages) {
    if (config.max_landing_pages === -1) features.push({ text: "Unlimited landing pages", included: true });
    else if (config.max_landing_pages > 0) features.push({ text: `Up to ${config.max_landing_pages} landing pages`, included: true });
  }

  // Live sessions hidden


  // Storage
  const storageText = formatStorage(config.max_storage_mb);
  if (storageText) features.push({ text: storageText, included: true });

  // Daily views — always show with tooltip. May be overridden by selected tier at render time.
  const dv = formatDailyViews(config.daily_view_limit);
  if (dv) features.push({ text: dv.text, included: true, tooltip: dv.tooltip, isDailyViews: true } as any);

  // Feature toggles (admin source of truth)
  // YouTube video import, Lead capture, WhatsApp auto-message, Live broadcast hidden
  features.push({ text: "Video sharing", included: !!config.feature_video_sharing });
  features.push({ text: "Custom branding", included: !!config.feature_custom_branding });
  features.push({ text: "Smart follow-up reminders", included: !!config.feature_smart_reminders });
  features.push({ text: "Analytics dashboard", included: !!config.feature_analytics });
  features.push({ text: "Per-prospect watch analytics", included: !!config.feature_advanced_analytics });
  features.push({ text: "Team dashboard", included: !!config.feature_advanced_analytics });
  features.push({ text: "Priority support", included: !!config.feature_priority_support });

  return features;
};

export const PricingSection = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { plan: userPlan, refreshPlan } = usePlan();
  const { isMember: isNevoraiMember } = useNevoraiMember();
  const { openSupport } = useWhatsAppSupport();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const isCurrentTier = (t: string) => userPlan.isPaid && userPlan.tier === t && !userPlan.isExpired;
  const onBasic = isCurrentTier("basic") || (!userPlan.isPaid && isNevoraiMember);
  const onPro = isCurrentTier("pro");

  const { data: planConfigs = [] } = useQuery({
    queryKey: ["plan-configs-landing"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*");
      return (data || []) as any[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // View tiers per plan (Basic / Pro). Used to derive the base tier price + daily views
  // shown on each card. Tier selection happens inside the app on the billing page.
  const { data: viewTiers = [] } = useQuery({
    queryKey: ["plan-view-tiers-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plan_tiers" as any)
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      return (data || []) as any[];
    },
    staleTime: 60_000,
  });

  // Resolve base tier for a plan: explicit `is_base` flag → lowest daily_views fallback.
  const getBaseTier = (planName: string) => {
    const planTiers = viewTiers.filter((t: any) => t.plan_name === planName.toLowerCase());
    if (!planTiers.length) return null;
    const explicit = planTiers.find((t: any) => t.is_base);
    if (explicit) return explicit;
    return [...planTiers].sort(
      (a: any, b: any) => (a.daily_views || 0) - (b.daily_views || 0),
    )[0];
  };

  const loadRazorpayScript = (): Promise<boolean> => new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  const handlePlanClick = useCallback(async (planName: string) => {
    const lname = planName.toLowerCase();
    // Guard: don't let users re-purchase the plan they're already on
    if ((lname === "basic" && onBasic) || (lname === "pro" && onPro)) {
      toast.info("You're already on this plan.");
      return;
    }
    if (planName === "Free") {
      navigate(user ? "/dashboard" : "/auth?tab=signup");
      return;
    }
    if (!user) {
      // After login, return user to /pricing where checkout opens via the same flow
      navigate(`/auth?tab=signup&redirect=/pricing&plan=${planName.toLowerCase()}`);
      return;
    }
    const config = planConfigs.find((c: any) => c.plan_name === planName.toLowerCase());
    if (!config) {
      toast.error("Plan not available right now.");
      return;
    }
    const planKey = `${planName.toLowerCase()}_monthly`;
    setLoadingPlan(planKey);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Failed to load payment gateway");
      // tier_id omitted on signup → server resolves the plan's base tier automatically.
      // display_price is the price the user actually saw; server rejects mismatches.
      const baseTier = getBaseTier(planName);
      const displayPrice = baseTier?.monthly_price ?? null;
      const { data, error } = await supabase.functions.invoke("razorpay-portal", {
        body: { action: "create_order", plan_key: planKey, display_price: displayPrice },
      });
      if (error || !data?.order_id) {
        const message = await getSupabaseFunctionErrorMessage(error, data?.error || "Failed to create order");
        throw new Error(message);
      }

      const requiresUpgradePricing = planName === "Pro" && userPlan.isPaid && userPlan.tier === "basic" && !userPlan.isExpired;
      if (requiresUpgradePricing && !data.is_plan_upgrade) {
        throw new Error("Upgrade pricing could not be calculated. Full-price checkout was blocked.");
      }

      const payableToday = Number(data.prorated_charge ?? (Number(data.amount) / 100));

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "Nevorai",
        description: data.is_plan_upgrade
          ? `Upgrade to ${planName} — pay ₹${payableToday} today for ${data.days_remaining} day${data.days_remaining === 1 ? "" : "s"} left (renews at ₹${data.target_price}/mo)`
          : `${planName} Plan — monthly`,
        order_id: data.order_id,
        handler: async (response: any) => {
          try {
            const { error: verifyError } = await supabase.functions.invoke("razorpay-portal", {
              body: {
                action: "verify_payment",
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan_key: planKey,
              },
            });
            if (verifyError) throw verifyError;
            toast.success(`Payment successful! Welcome to ${planName} 🎉`, { duration: 6000 });
            // Payment receipt via Resend — fire and forget.
            import("@/lib/email").then(({ sendSubscriptionReceipt }) =>
              sendSubscriptionReceipt({
                to: user.email ?? "",
                name: profile?.full_name ?? "there",
                plan: planName,
                amount: payableToday,
                orderId: response.razorpay_order_id,
              }),
            );
            refreshPlan();
            setTimeout(() => navigate("/billing"), 1500);
          } catch {
            toast.error("Payment received but verification pending. Contact support.");
            openSupport(`Hi, my ${planName} payment was successful but access not unlocked. Payment ID: ${response.razorpay_payment_id}`);
          }
        },
        prefill: {
          name: profile?.full_name || "",
          email: user.email,
          contact: profile?.phone || "",
        },
        theme: { color: "#2563EB" },
        modal: { ondismiss: () => setLoadingPlan(null) },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setLoadingPlan(null);
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setLoadingPlan(null);
    }
  }, [user, profile, planConfigs, navigate, openSupport, refreshPlan]);


  // Dynamically build a card for every enabled plan in subscription_plans,
  // ordered by display_order. Free plan is only shown when it's still
  // explicitly enabled in admin — with Free disabled we hide the card so
  // the landing page matches the app (no free tier advertised).
  const enabledPlans = [...planConfigs]
    .filter((c: any) => c && c.is_enabled !== false && c.plan_name !== "free" && c.plan_name !== "enterprise")
    .sort((a: any, b: any) => (a.display_order ?? 100) - (b.display_order ?? 100));

  const cards: {
    name: string;
    price: string;
    period: string;
    daily: string;
    badge: string | null;
    features: { text: string; included: boolean; tooltip?: string }[];
    cta: string;
    variant: "outline" | "default" | "hero";
    highlight: boolean;
  }[] = [];

  // Replace the generic "X views/day total" feature line with copy that makes
  // it obvious the cap is the *starting* tier and can be upgraded in-app.
  const overrideDailyViewsBase = (
    feats: ReturnType<typeof buildFeatures>,
    baseTier: any,
  ) => {
    if (!baseTier?.daily_views) return feats;
    return feats.map((f: any) =>
      f.isDailyViews
        ? {
            ...f,
            text: `Daily view limit — starts at ${Number(baseTier.daily_views).toLocaleString("en-IN")}/day, upgrade inside app`,
          }
        : f,
    );
  };

  for (const config of enabledPlans) {
    const planName = config.plan_name as string;
    const displayName = (config.display_name && String(config.display_name).trim())
      || planName.charAt(0).toUpperCase() + planName.slice(1);

    if (planName === "free") {
      cards.push({
        name: displayName,
        price: "₹0",
        period: "/forever",
        daily: config.daily_view_limit && config.daily_view_limit > 0
          ? `${Number(config.daily_view_limit).toLocaleString("en-IN")} views/day`
          : "Start building free",
        badge: config.plan_badge_text || null,
        features: buildFreeFeatures(config),
        cta: FREE_CTA,
        variant: FREE_VARIANT,
        highlight: false,
      });
      continue;
    }

    const baseTier = getBaseTier(planName);
    const price = baseTier?.monthly_price ?? config.monthly_price ?? 0;
    const highlight = planName === "pro" || /popular/i.test(config.plan_badge_text || "");
    cards.push({
      name: displayName,
      price: `₹${Number(price).toLocaleString("en-IN")}`,
      period: "/month",
      daily: baseTier?.daily_views
        ? `Starts at ${baseTier.daily_views} views/day · upgrade anytime`
        : "",
      badge: config.plan_badge_text || (highlight ? "Most Popular" : null),
      features: overrideDailyViewsBase(buildFeatures(config), baseTier),
      cta: `Get ${displayName}`,
      variant: highlight ? "hero" : "default",
      highlight,
    });
  }

  const totalCards = cards.length;
  const gridCols =
    totalCards === 1
      ? "max-w-md mx-auto"
      : totalCards === 2
      ? "md:grid-cols-2 max-w-3xl mx-auto"
      : totalCards === 3
      ? "md:grid-cols-3 max-w-5xl mx-auto"
      : totalCards === 4
      ? "md:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto"
      : "md:grid-cols-2 lg:grid-cols-5 max-w-7xl mx-auto";


  return (
    <section id="pricing" className="py-24 relative">
      <div className="container-app">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">
            Simple Pricing. <span className="text-gradient-brand">Pick the Plan That Fits You.</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Storage-based plans built for Indian network marketers. Cancel anytime.
          </p>
        </motion.div>

        {/* Build all card render nodes once, used by both mobile carousel and desktop grid */}
        {(() => {
          const planNodes: { key: string; node: ReactNode }[] = cards.map((plan, i) => ({
            key: plan.name,
            node: (
              <motion.div
                key={plan.name}
                className={`glass-card p-6 relative flex flex-col h-full ${
                  plan.highlight ? "border-primary/40 glow-primary" : ""
                }`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap z-10 shadow-md" style={{ background: "var(--text-primary)", color: "var(--bg-base)" }}>
                    {plan.badge}
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="text-lg font-heading font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[13px] text-muted-foreground/70 font-normal">from</span>
                    <span className="text-3xl font-heading font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  {plan.daily ? (
                    <p className="text-xs text-primary mt-1.5">{plan.daily}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1.5">{"\u00A0"}</p>
                  )}
                </div>
                {/* Cap list height on both mobile and desktop so all cards stay
                    visually balanced. Internal scroll keeps the grid aligned. */}
                <ul className="space-y-3 mb-6 max-h-[260px] md:max-h-[340px] overflow-y-auto pr-1 md:flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-center gap-2 text-sm">
                      {f.included ? (
                        <Check size={16} className="text-success shrink-0" />
                      ) : (
                        <X size={16} className="text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={f.included ? "text-foreground" : "text-muted-foreground/60"}>
                        {f.text}
                      </span>
                      {(f as any).tooltip && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                                <Info size={11} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">
                              {(f as any).tooltip}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </li>
                  ))}
                </ul>
                {(() => {
                  const lname = plan.name.toLowerCase();
                  if (lname === "free") {
                    if (!user || (!userPlan.isPaid && !isNevoraiMember)) {
                      return (
                        <Button variant={plan.variant} className="w-full gap-2" onClick={() => handlePlanClick(plan.name)}>
                          {plan.cta}
                        </Button>
                      );
                    }
                    return <Button variant="outline" disabled className="w-full">Current Plan</Button>;
                  }
                  if (lname === "basic") {
                    if (onBasic) {
                      return (
                        <Button disabled className="w-full gap-2">
                          {isNevoraiMember && !userPlan.isPaid ? (<><Sparkles size={14} /> Active via Nevorai membership</>) : "Current Plan"}
                        </Button>
                      );
                    }
                    if (onPro) return <Button disabled variant="outline" className="w-full">Included in Pro</Button>;
                  }
                  if (lname === "pro" && onPro) {
                    return <Button disabled className="w-full">Current Plan</Button>;
                  }
                  const isUpgrade = onBasic && (lname === "pro" || lname === "growth" || lname === "leader");
                  return (
                    <Button
                      variant={plan.variant}
                      className="w-full gap-2"
                      onClick={() => handlePlanClick(plan.name)}
                      disabled={loadingPlan === `${lname}_monthly`}
                    >
                      {loadingPlan === `${lname}_monthly` && <Loader2 size={16} className="animate-spin" />}
                      {isUpgrade ? <><ArrowUp size={14} /> Upgrade to {plan.name}</> : plan.cta}
                    </Button>
                  );
                })()}
              </motion.div>
            ),
          }));

          const allNodes: { key: string; node: ReactNode }[] = [...planNodes];


          return (
            <>
              {/* Mobile: swipeable carousel with dots */}
              <MobilePricingCarousel items={allNodes} />

              {/* Desktop: original grid */}
              <div className={`hidden md:grid gap-6 ${gridCols}`}>
                {allNodes.map((n) => (
                  <div key={n.key} className="h-full">
                    {n.node}
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Disclaimer */}
        <p className="text-center text-xs mt-6 max-w-lg mx-auto text-hero-muted">
          * Conversion rates based on video funnels with WhatsApp follow-up enabled. Results vary based on content quality and audience.
        </p>
      </div>
    </section>
  );
};

// Mobile-only swipeable pricing carousel with dot indicators.
// Kept inside this file (not extracted) to keep the change scoped to one
// component, per the user's UI-only request.
const MobilePricingCarousel = ({ items }: { items: { key: string; node: ReactNode }[] }) => {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!api) return;
    setActive(api.selectedScrollSnap());
    const onSelect = () => setActive(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  return (
    <div className="md:hidden">
      {/* py-4 on the carousel gives breathing room so the absolute -top-3 badges
          aren't clipped by Embla's overflow-hidden viewport. items-stretch is
          removed by passing no extra classes — children size to their own
          content (md:h-full only kicks in on desktop). */}
      <Carousel setApi={setApi} opts={{ align: "center", loop: false }} className="w-full">
        <CarouselContent className="-ml-4 py-4 items-stretch">
          {items.map((it) => (
            <CarouselItem key={it.key} className="pl-4 basis-[88%] sm:basis-[70%] h-auto">
              {it.node}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="flex items-center justify-center gap-2 mt-3">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            aria-label={`Show ${it.key} plan`}
            onClick={() => api?.scrollTo(i)}
            className={cn(
              "h-2 rounded-full transition-all",
              active === i ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">Swipe to compare plans</p>
    </div>
  );
};
