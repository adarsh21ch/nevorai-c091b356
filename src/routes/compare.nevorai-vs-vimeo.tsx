import { createFileRoute } from "@tanstack/react-router";
import { ComparePage, type CompareContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/compare/nevorai-vs-vimeo";
const TITLE = "Nevorai vs Vimeo — Better Video Tool for Indian Business";
const DESCRIPTION =
  "Vimeo costs ₹10,000+/month for what Indian businesses actually need. Nevorai gives you tracking, lead capture and WhatsApp-first sharing for a fraction of the price. Honest comparison.";

const content: CompareContent = {
  competitor: "Vimeo",
  hero: {
    titleStart: "Nevorai vs Vimeo —",
    titleAccent: "better video tool for Indian business.",
    subtitle:
      "Vimeo is brilliant for filmmakers. It's overpriced and overbuilt for the average Indian business owner sharing sales videos on WhatsApp. Here's the honest comparison.",
  },
  intro: [
    "Vimeo started life as a Flickr-for-video — a clean place for filmmakers to host their reels. Over the years it's bolted on every business feature imaginable: video hosting, OTT, live streaming, analytics, lead capture. Each one is solid. Each one is expensive.",
    "If you're a video production studio, a media company, or a global SaaS team, Vimeo's enterprise plans make sense. If you're an Indian coach, agent, or solo entrepreneur sharing sales videos with prospects on WhatsApp, you're paying ₹10,000-25,000 per month for features you'll never use.",
    "Nevorai is purpose-built for the second group. Same essential features — distraction-free player, viewer tracking, lead capture, gated content — at Indian pricing.",
  ],
  rows: [
    { feature: "Distraction-free player", nevorai: true, other: true },
    { feature: "Real-time viewer activity feed", nevorai: true, other: "Pro+ plan only" },
    { feature: "Built-in lead capture form", nevorai: true, other: "Premium plan only" },
    { feature: "Unskippable / locked seek bar", nevorai: true, other: "Workaround via player config" },
    { feature: "Multi-step video funnel", nevorai: true, other: false },
    { feature: "Access code / gated content", nevorai: true, other: true },
    { feature: "WhatsApp-optimised share preview", nevorai: true, other: "Generic" },
    { feature: "Live sessions from recorded video", nevorai: true, other: "Premium / Live plan only" },
    { feature: "Indian pricing in ₹", nevorai: true, other: false },
    { feature: "UPI / Razorpay payments", nevorai: true, other: false },
    { feature: "Hindi-friendly support", nevorai: true, other: false },
    { feature: "Free plan for actual business use", nevorai: "1 GB free", other: "500 MB total, no business features" },
    { feature: "Pricing for tracking + lead capture", nevorai: "₹499/month", other: "₹2,500-25,000/month equivalent" },
    { feature: "OTT / streaming app builder", nevorai: false, other: true },
    { feature: "Filmmaker community & showcases", nevorai: false, other: true },
  ],
  whyParagraphs: [
    {
      title: "Pricing built for India, not San Francisco",
      body: "Vimeo's Indian rupee pricing is just a converted version of US pricing — you pay roughly the same as a US business with 10x the budget. Nevorai is priced for Indian margins. Free for 1 GB. Pro at ₹499/month. The same lead-capture features Vimeo charges ₹2,500+ for.",
    },
    {
      title: "Built around WhatsApp, not email",
      body: "Vimeo assumes you share videos via email links and embedded players on a website. Indian business runs on WhatsApp. Nevorai's smart links produce proper WhatsApp preview cards, work without an account, and look professional in a chat — not like a forwarded technical link.",
    },
    {
      title: "No bloat",
      body: "Vimeo's Premium plan includes OTT, livestreaming, encoder support, audience CRM, employee video tools — useful for media companies, useless for a solo coach. Nevorai ships only what you actually need to convert a prospect into a lead.",
    },
    {
      title: "Indian payments and support",
      body: "Pay via UPI, debit card or netbanking through Razorpay. Get support in Hindi or English. No PayPal, no foreign currency surprises, no 'sorry our team is in PST' on a Tuesday morning when you have a launch.",
    },
  ],
  honest: "If you produce broadcast-quality video, run an OTT app, or need enterprise SSO and team workflows, Vimeo's premium plans are still the right pick. Nevorai is for business owners who want lead conversion features at Indian pricing — not for video production teams.",
  faq: [
    {
      q: "Can I migrate my videos from Vimeo to Nevorai?",
      a: "Yes — Vimeo lets you download all your original uploads from your account dashboard. Drag them into Nevorai and rebuild your funnels in an evening. Most Indian users we've migrated were paying Vimeo ₹15,000+/month for two videos and one lead form.",
    },
    {
      q: "Is Nevorai's video quality as good as Vimeo's?",
      a: "Yes. Both use modern adaptive streaming so video quality auto-adjusts to the viewer's internet speed. The encoding pipelines are similar. The difference is what you can do around the video, not the video itself.",
    },
    {
      q: "Vimeo's analytics are detailed — does Nevorai match that?",
      a: "Nevorai gives you the analytics that drive sales decisions: who watched, how much, where they dropped off, did they fill the form. Vimeo's enterprise plans add aggregate engagement heatmaps and audience demographics — useful for media companies analysing seasons of content, less useful for a coach with one preview video.",
    },
    {
      q: "Why is Vimeo so expensive in India?",
      a: "Vimeo is a US company with US pricing structures. Their cheapest plan with real business features (tracking + lead capture) starts around ₹2,500/month and the more useful plans run ₹10,000-25,000. They built for the US enterprise market and the same pricing follows everywhere.",
    },
    {
      q: "Can I run a paid course on Nevorai instead of Vimeo OTT?",
      a: "Yes — use a multi-step funnel with access codes for each module. Students pay you via UPI, you share the access code, they unlock the full course. It's not a full LMS, but for under 1000 students it works beautifully and costs nothing extra.",
    },
  ],
};

export const Route = createFileRoute("/compare/nevorai-vs-vimeo")({
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
  component: () => <ComparePage content={content} />,
});
