import { createFileRoute } from "@tanstack/react-router";
import { ComparePage, type CompareContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/compare/nevorai-vs-youtube";
const TITLE = "Nevorai vs YouTube — Which is Better for Business Videos?";
const DESCRIPTION =
  "Honest comparison of Nevorai and YouTube for business videos. Distractions, tracking, lead capture, monetisation. Find out which is right for sharing sales videos with prospects.";

const content: CompareContent = {
  competitor: "YouTube",
  hero: {
    titleStart: "Nevorai vs YouTube —",
    titleAccent: "which is better for business videos?",
    subtitle:
      "YouTube is the world's biggest video platform. It's also the worst place to share a sales video. Here's the honest, side-by-side breakdown for Indian business owners.",
  },
  intro: [
    "YouTube is built for one thing: keeping viewers on YouTube. That's a brilliant business model for YouTube and a terrible one for you when you're trying to convert a prospect into a customer. Every recommendation, every ad, every comment is engineered to pull your prospect away from your video and toward the next dopamine hit.",
    "Nevorai is the opposite. It's built for one job: making sure your prospect watches your video, you know they watched, and you can follow up. No recommendations. No ads. No competitor's reel one click away.",
    "We're not saying YouTube is bad — it's perfect for building an audience. But for a sales video sent to a specific prospect on WhatsApp, YouTube costs you leads every single day.",
  ],
  rows: [
    { feature: "Distraction-free player", nevorai: true, other: false },
    { feature: "No competitor recommendations alongside", nevorai: true, other: false },
    { feature: "No pre-roll or mid-roll ads", nevorai: true, other: false },
    { feature: "Real-time viewer activity feed", nevorai: true, other: "Aggregate analytics only" },
    { feature: "See exact viewer name and contact", nevorai: true, other: false },
    { feature: "Built-in lead capture form", nevorai: true, other: false },
    { feature: "Unskippable / locked seek bar", nevorai: true, other: false },
    { feature: "Multi-step video funnel", nevorai: true, other: "Playlists only" },
    { feature: "Access code / gated content", nevorai: true, other: "Unlisted ≠ gated" },
    { feature: "WhatsApp-optimised share preview", nevorai: true, other: "Generic preview" },
    { feature: "Scheduled live sessions from recorded video", nevorai: true, other: "Live only, no scheduling of recordings" },
    { feature: "Built for Indian business (₹, UPI, WhatsApp)", nevorai: true, other: false },
    { feature: "Free hosting", nevorai: "1 GB free, ₹ Indian pricing", other: "Unlimited free" },
    { feature: "Audience discovery / SEO traffic", nevorai: false, other: true },
    { feature: "Comments and community features", nevorai: false, other: true },
  ],
  whyParagraphs: [
    {
      title: "Distractions kill conversions",
      body: "Every Indian sales video on YouTube competes with cricket highlights, your competitor's testimonial, and 'is this a scam' explainer videos. Your prospect taps once, gets distracted, and you've lost them. Nevorai removes the entire YouTube ecosystem so the only choice is to watch your video or close the tab.",
    },
    {
      title: "Tracking changes how you sell",
      body: "On YouTube you guess who watched. On Nevorai you know. That single difference rewires your entire follow-up: instead of calling 50 cold leads, you call the 8 prospects who watched 80%+ of your plan video. Same effort, much better conversion.",
    },
    {
      title: "Lead capture inside the video",
      body: "YouTube's end-screen 'subscribe' card was designed for content creators, not for sales. Nevorai shows a name + phone form at the moment of peak interest — typically right after the income proof, the price reveal, or the testimonial. That's where leads convert.",
    },
    {
      title: "WhatsApp share previews that look professional",
      body: "Indian business runs on WhatsApp. YouTube's WhatsApp preview shows the YouTube logo and a generic thumbnail. Nevorai's preview shows your branding, your title, and a clean thumbnail — looks like a professional invitation, not a forwarded link.",
    },
  ],
  honest: "If your goal is to build a public audience and rank on Google for 'how to invest in mutual funds India', YouTube is unbeatable — keep your educational content there. Use Nevorai for the sales video you send to specific prospects on WhatsApp. The two work together: YouTube brings new viewers, Nevorai converts them into leads.",
  faq: [
    {
      q: "Should I delete my YouTube channel and move everything to Nevorai?",
      a: "No. Use both for what each does best. YouTube for evergreen educational content that brings new prospects. Nevorai for the specific sales videos you send to those prospects on WhatsApp. Most successful Indian creators we work with use this combo.",
    },
    {
      q: "Can prospects watch a Nevorai video without an account?",
      a: "Yes — same as YouTube. Your prospect taps the link and the video plays in their browser. No account, no login, no app install. The only optional step is filling the lead form, which they choose to do.",
    },
    {
      q: "Why doesn't YouTube just add lead capture and tracking?",
      a: "Because YouTube's business model is ad revenue from keeping viewers on YouTube. Lead capture and detailed viewer tracking would compete with that goal. Don't expect YouTube to ever build features that send your prospect off-platform — it's not in their interest.",
    },
    {
      q: "Is my Nevorai video private or public?",
      a: "You choose. Public links work like an unlisted YouTube video — anyone with the link can watch. Or lock it with an access code so only invited prospects can watch. YouTube unlisted videos can be discovered and shared; Nevorai access codes actually gate the content.",
    },
    {
      q: "What if YouTube is free and Nevorai isn't?",
      a: "Nevorai's free plan covers 1 GB which is enough for two or three sales videos — most agents and coaches never need to upgrade. Even the Pro plan at ₹499/month is cheaper than the value of one extra closed deal per month.",
    },
  ],
};

export const Route = createFileRoute("/compare/nevorai-vs-youtube")({
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
