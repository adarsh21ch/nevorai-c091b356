import { createFileRoute } from "@tanstack/react-router";
import { UseCasePage, type UseCaseContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/use-cases/insurance-agents";
const TITLE = "Video Sales Tool for Insurance Agents | Nevorai";
const DESCRIPTION =
  "Help prospects understand insurance with unskippable explainer videos. See exactly who watched, capture lead details, and qualify prospects before the first call. Built for LIC agents, health insurance advisors and financial planners in India.";

const content: UseCaseContent = {
  hero: {
    eyebrow: "For insurance agents & financial advisors",
    titleStart: "Help prospects understand insurance —",
    titleAccent: "watch the video, skip the skip.",
    subtitle:
      "LIC agents, health insurance advisors, and financial planners use Nevorai to qualify leads before the first call. No more explaining the same policy 50 times — let your video do the work and only call the prospects who're actually ready.",
  },
  problem: {
    title: "Why insurance is the hardest video category to share",
    paragraphs: [
      "Insurance is a trust business built on long, technical conversations. Most prospects don't want to read a 12-page policy PDF, and they definitely don't want to sit through your 30-minute pitch on Zoom. So you do the same thing every other agent does: send a brochure on WhatsApp, hope they read it, and chase them for a week.",
      "If you do send a video, it goes on YouTube — where the next thumbnail is 'insurance scam exposed' or your competitor's plan comparison. Your prospect watches two minutes, gets nervous, closes the tab, and ghosts you. You spent your evening editing the explainer and got nothing.",
      "Worse: even when a prospect does watch the full video, you have no idea. So you call them with the same 'have you decided?' question and feel like you're chasing. The prospect feels chased. Nobody buys insurance from someone they feel chased by.",
    ],
  },
  solution: {
    title: "How Nevorai changes insurance prospecting",
    bullets: [
      {
        heading: "Distraction-free policy explainer",
        body: "Your prospect watches your premium calculation and benefit walkthrough on a clean page — no 'top 5 LIC scams' video sitting in the sidebar making them nervous.",
      },
      {
        heading: "Know exactly who's interested",
        body: "Real-time activity feed shows every prospect who watched. The ones who finished the video and watched the maturity benefit segment twice are your hottest leads.",
      },
      {
        heading: "Capture phone + age + city",
        body: "Built-in lead form collects everything you need to quote a policy. Prospects fill it because they get a real answer in return — not because they're forced to.",
      },
      {
        heading: "WhatsApp share with rich preview",
        body: "Send to 50 prospects from your contact list. The preview card shows your name and 'LIC Authorised Agent' so it doesn't look like spam.",
      },
      {
        heading: "Multi-policy funnel",
        body: "Build separate funnels for term life, health, ULIP and child plans. Send the right funnel to the right prospect based on their stage of life.",
      },
      {
        heading: "Premium video access codes",
        body: "Lock detailed comparison videos behind an access code so only serious prospects watch. Reward them with the full numbers after they share their details.",
      },
    ],
  },
  workflow: {
    title: "Step by step: how insurance agents use Nevorai",
    steps: [
      {
        title: "Record one good policy explainer",
        body: "5-7 minutes is enough. Walk through the policy, show the premium calculation on screen, end with a clear next step. Use your phone — production quality matters less than clarity.",
      },
      {
        title: "Upload to Nevorai and configure the form",
        body: "Add a lead form that captures phone, age and city. Show it after the prospect has watched the maturity benefit so they understand why you need their age.",
      },
      {
        title: "Share with your existing pipeline first",
        body: "Send the link to every prospect who's been 'thinking about it' for months. Tell them: 'Watch this 7-minute video and I'll send you a custom quote tomorrow.'",
      },
      {
        title: "Sort the activity feed by watch percentage",
        body: "Anyone who watched 80%+ is qualified. Anyone who filled the form is hot. Call them in that order on the same day.",
      },
      {
        title: "Send a personalised quote, not a follow-up",
        body: "Because you know they watched, you can open with the specific benefit they spent the most time on. That's not chasing — that's relevant.",
      },
      {
        title: "Use live sessions for community webinars",
        body: "Once a month, run a live session 'Term insurance for parents in their 40s' using a recorded video. 50 prospects join, each one fills the form, you book 10 follow-ups.",
      },
      {
        title: "Build separate funnels per product",
        body: "Term life buyers think differently from health insurance buyers. Use a different funnel for each so the messaging fits.",
      },
    ],
  },
  faq: [
    {
      q: "I'm an LIC agent — can I use Nevorai?",
      a: "Yes. You're sharing your own explanation of an LIC policy, which is exactly what you'd do face-to-face. Don't share copyrighted LIC marketing videos as-is; record your own walkthrough. Hundreds of LIC agents in India already share videos this way, just on WhatsApp without tracking.",
    },
    {
      q: "What about IRDAI compliance?",
      a: "IRDAI rules apply to what you say, not where you say it. Use the same disclaimers you'd use in person and you're fine. Nevorai never edits or alters your video.",
    },
    {
      q: "Can I show different premium numbers to different prospects?",
      a: "Use a multi-step funnel: prospect fills age + sum assured, you call them with the personalised quote. Don't try to compute premiums dynamically inside the video — keep that conversation human.",
    },
    {
      q: "Will prospects share my Nevorai link with other agents?",
      a: "If you're worried about competitors, lock the video with an access code. Each prospect gets a one-time code that expires. Or skip the lock and treat virality as free leads — every new viewer shows up in your dashboard.",
    },
    {
      q: "Is this better than calling cold leads from a list?",
      a: "Way better. A prospect who watched 5 minutes of your video is 20x more likely to take your call than a cold name from a database. You're spending the same time, just on warmer leads.",
    },
  ],
  related: [
    { to: "/use-cases/network-marketing", label: "For MLM leaders" },
    { to: "/use-cases/coaches", label: "For online coaches" },
    { to: "/use-cases/real-estate", label: "For real estate agents" },
    { to: "/pricing", label: "Pricing" },
  ],
  ctaLabel: "Start Free — Built for Insurance Agents",
};

export const Route = createFileRoute("/use-cases/insurance-agents")({
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
