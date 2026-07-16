import { createFileRoute } from "@tanstack/react-router";
import { UseCasePage, type UseCaseContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/use-cases/network-marketing";
const TITLE = "Video Funnels for Network Marketing | Nevorai";
const DESCRIPTION =
  "The smart way for MLM leaders in India to share plan videos. Unskippable player, real-time tracking, lead capture and WhatsApp share — built for network marketers.";

const content: UseCaseContent = {
  hero: {
    eyebrow: "For network marketing & MLM leaders",
    titleStart: "The smart way for MLM leaders to",
    titleAccent: "share plan videos that actually convert.",
    subtitle:
      "Stop dropping prospects on YouTube where your competitors' reels sit one click away. Share an unskippable plan video on WhatsApp, see exactly who watched it, and only follow up with the prospects who're genuinely interested.",
  },
  problem: {
    title: "Why YouTube is killing your network marketing business",
    paragraphs: [
      "Every MLM leader in India runs the same playbook: send the plan video to your prospect on WhatsApp, follow up the next day, hope they joined a Zoom meeting. The problem is the link itself. The moment your prospect taps a YouTube link, they're inside YouTube — and YouTube is built to keep them on YouTube, not on your opportunity.",
      "Your 12-minute plan video is surrounded by recommendations for fitness reels, your competitor's training, and 'how to spot an MLM scam' rabbit holes. Your prospect watches 90 seconds, gets distracted, and you lose them. You don't even know they tapped the link, so you call them blind and ask 'did you watch?' — which is the worst sales question in the world.",
      "Network marketing is a numbers game on top of a trust game. If you can't see who's interested, you waste hours chasing cold prospects and miss the warm ones. Multiply that across your downline of 50 partners and you're losing thousands of qualified prospects every month.",
    ],
  },
  solution: {
    title: "How Nevorai helps MLM leaders convert prospects",
    bullets: [
      {
        heading: "Unskippable plan video",
        body: "No recommendations, no ads, no sidebar. Just your plan, your branding, your call-to-action. Lock the seek bar so prospects watch the qualifying parts before they reach the next step.",
      },
      {
        heading: "Real-time prospect activity",
        body: "Get a notification the moment a prospect taps your WhatsApp link. See watch percentage, drop-off point, device and city. Call the people who watched 80%+ — they're warm.",
      },
      {
        heading: "Lead capture before they drop off",
        body: "Show a name + phone form at the moment of highest intent — typically right after the income proof or product reveal. Capture leads even from prospects who never reply to WhatsApp.",
      },
      {
        heading: "WhatsApp-first sharing",
        body: "Smart links with proper preview cards in WhatsApp, Telegram and Instagram. One link works for personal chats, groups and broadcast lists. Share the same link with your full downline.",
      },
      {
        heading: "Multi-step funnel for the full plan",
        body: "Split your sales process into a guided journey: intro video → company story → product walkthrough → income plan → join CTA. Each step unlocks the next so prospects don't skip ahead.",
      },
      {
        heading: "Live sessions for weekly opportunity meetings",
        body: "Schedule a recorded plan video to play live on Sunday at 8 PM. Your downline shares one link, hundreds of prospects join together, you get every viewer's contact details.",
      },
    ],
  },
  workflow: {
    title: "Step by step: how MLM leaders use Nevorai",
    steps: [
      {
        title: "Upload your plan video",
        body: "Drag your existing plan video — the one you already share on WhatsApp — into Nevorai. Free plan supports 1 GB which is enough for two or three videos.",
      },
      {
        title: "Configure the lead form",
        body: "Add a name + phone form that shows up after the income proof segment. Optionally collect city so you know which prospects to route to which cross-line leader.",
      },
      {
        title: "Lock the player",
        body: "Disable scrubbing for the first viewing. Your prospect cannot fast-forward past the qualifying parts. After they fill the form, you can let them re-watch freely.",
      },
      {
        title: "Share the smart link on WhatsApp",
        body: "Copy your Nevorai link and paste into prospect chats, your downline broadcast list, or your Instagram bio. The preview card shows your branding and a thumbnail — looks professional, not spammy.",
      },
      {
        title: "Watch your activity feed",
        body: "Open Nevorai on your phone every few hours. See exactly which prospects watched the plan, how much they watched, and who filled the form. Sort by watch percentage.",
      },
      {
        title: "Call the warm prospects first",
        body: "A prospect who watched 90% and filled the lead form is 10x more likely to join than someone who watched 20%. Call them within an hour while they're still interested.",
      },
      {
        title: "Re-engage cold prospects with a follow-up funnel",
        body: "Prospects who watched only the intro can be pushed into a shorter testimonial-only funnel. Send a different Nevorai link with social proof. Track again.",
      },
    ],
  },
  faq: [
    {
      q: "Is Nevorai compliant with my MLM company's policies?",
      a: "Nevorai is just a video sharing tool — like WhatsApp or YouTube. You're sharing your own approved plan video; we don't change the content. Most companies that ban Facebook ads or off-platform funnels have no rules against sharing the official plan video on WhatsApp via a tracking link. Check your company's policy doc to be safe.",
    },
    {
      q: "Can my whole downline use the same Nevorai account?",
      a: "We recommend each leader get their own free account so they see their own prospect activity. The free plan covers two funnels which is enough for most direct sellers. If you're a top leader, the Pro plan lets you create branded funnel templates your downline can copy.",
    },
    {
      q: "Will my company allow lead capture from a plan video?",
      a: "You're capturing your own prospect's contact details for your own follow-up — same as if you asked for their number on WhatsApp. The lead form is on your Nevorai page, not on the company's site. Most direct selling companies in India have no rule against this.",
    },
    {
      q: "Can I run weekly opportunity meetings as live sessions?",
      a: "Yes — schedule a recorded plan video to play at a fixed time. Hundreds of prospects join the same link together, watch the full plan, and submit their details. Costs nothing extra and replaces Zoom meetings that no-show 70% of the time.",
    },
    {
      q: "How does this compare to MLM-specific tools?",
      a: "Most MLM tools are CRMs that store contacts; they don't actually deliver the plan video any better than YouTube. Nevorai focuses on the one thing that matters: making sure your prospect watches the plan and you know who's interested. Use it alongside whatever CRM your team uses.",
    },
  ],
  related: [
    { to: "/use-cases/insurance-agents", label: "For insurance agents" },
    { to: "/use-cases/coaches", label: "For online coaches" },
    { to: "/features", label: "All features" },
    { to: "/pricing", label: "Pricing" },
  ],
  ctaLabel: "Start Free — Built for Indian MLM Leaders",
};

export const Route = createFileRoute("/use-cases/network-marketing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          author: { "@type": "Organization", name: "Nevorai" },
          publisher: {
            "@type": "Organization",
            name: "Nevorai",
            logo: { "@type": "ImageObject", url: "https://nevorai.com/icons/icon-512x512.png" },
          },
          mainEntityOfPage: URL,
        }),
      },
    ],
  }),
  component: () => <UseCasePage content={content} />,
});
