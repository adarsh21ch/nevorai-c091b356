import { createFileRoute } from "@tanstack/react-router";
import { UseCasePage, type UseCaseContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/use-cases/coaches";
const TITLE = "Video Funnels for Online Coaches & Course Creators | Nevorai";
const DESCRIPTION =
  "Convert more students with unskippable course preview videos. Capture leads, gate premium lessons, and run live community sessions. Built for Indian coaches and course creators.";

const content: UseCaseContent = {
  hero: {
    eyebrow: "For online coaches & course creators",
    titleStart: "Convert more students with",
    titleAccent: "unskippable course preview videos.",
    subtitle:
      "Stop pricing yourself out of a course platform. Turn your free preview lesson into a converting funnel with lead capture, locked premium content, and real prospect tracking — for a fraction of what Teachable or Thinkific charge.",
  },
  problem: {
    title: "Why coaches keep losing students to free YouTube",
    paragraphs: [
      "You spent three months recording a 12-module course. You posted a 'free preview' on YouTube to drive sign-ups. The video got 2,000 views, three sign-ups, and a comment thread arguing about whether your method works. The 'related videos' panel pushed your prospect straight into someone else's free course.",
      "Course platforms like Teachable, Thinkific or Kajabi solve some of this — but they cost ₹4,000 to ₹15,000 per month and most Indian coaches only need 10% of their features. You don't need a full LMS to test whether your course concept converts. You need a smart preview link.",
      "And on WhatsApp? Forget it. Your students paste your YouTube link in a group, half of them watch on a tiny phone screen with autoplay sending them to reels, and you have no idea who actually finished the lesson. There's no way to follow up with the people who're genuinely interested.",
    ],
  },
  solution: {
    title: "How Nevorai works for coaches",
    bullets: [
      {
        heading: "Distraction-free preview lesson",
        body: "Your preview plays in a clean player with no recommendations pulling students into a competitor's course. Your branding, your CTA, your course.",
      },
      {
        heading: "Capture genuine course leads",
        body: "Show a name + phone + email form before the preview, in the middle, or after. Students fill it because they want the next lesson — not because they're forced.",
      },
      {
        heading: "Gate premium lessons with access codes",
        body: "Lock module 2 onwards behind an access code. Students who pay get the code via WhatsApp. No need for a full LMS just to deliver a paid course.",
      },
      {
        heading: "See who finished the preview",
        body: "Real-time activity feed shows every student, watch percentage and drop-off point. Students who watched 100% are 5x more likely to buy. Call them.",
      },
      {
        heading: "Multi-step preview funnel",
        body: "Hook video → testimonial → curriculum reveal → pricing → enrol. Each step unlocks the next, building intent before you ask for money.",
      },
      {
        heading: "Live cohort sessions",
        body: "Run weekly community calls as live sessions on Nevorai. Students join one link, you get every attendee's details, no Zoom links to manage.",
      },
    ],
  },
  workflow: {
    title: "Step by step: how coaches use Nevorai",
    steps: [
      {
        title: "Pick your strongest module as the preview",
        body: "Most coaches default to lesson 1 — wrong. Pick the lesson where students get a clear win. That's the one that proves the course works.",
      },
      {
        title: "Upload to Nevorai and add a hook intro",
        body: "Add a 30-second intro that frames why this lesson matters. Then drop straight into teaching. Don't pitch, teach.",
      },
      {
        title: "Configure lead capture at the right moment",
        body: "Show the form right after a teaching breakthrough — when the student is thinking 'this is exactly what I need'. Conversion 3-4x higher than asking upfront.",
      },
      {
        title: "Share the preview link in your WhatsApp community",
        body: "Drop the link in your group, your Instagram bio, your YouTube end screen. The Nevorai preview card looks professional, not like a sketchy gumroad page.",
      },
      {
        title: "Watch which students finish the lesson",
        body: "Sort your activity feed by watch percentage. Anyone who finished and rewatched the recap section is hot. Call them, don't DM.",
      },
      {
        title: "Send the paid course as a locked Nevorai funnel",
        body: "After students pay (Razorpay link in your DM), send them an access code that unlocks all 12 modules as a Nevorai funnel. Each lesson unlocks the next.",
      },
      {
        title: "Run weekly live sessions for community",
        body: "Every Sunday at 7 PM, a 30-minute live session where you reuse a recorded teaching video. Students join the same link, ask questions in WhatsApp parallel, you get full attendee tracking.",
      },
    ],
  },
  faq: [
    {
      q: "Is Nevorai a full course platform like Teachable?",
      a: "No, and that's the point. Teachable is overkill for coaches with under 500 students. Nevorai gives you the parts that actually drive conversions — preview funnels, lead capture, gated content — without the LMS bloat or the ₹15,000/month price tag. You can always graduate to a full LMS later.",
    },
    {
      q: "Can I sell a paid course directly through Nevorai?",
      a: "Nevorai handles the video delivery and access control. For payment, send students a Razorpay or UPI link in your DM, and once they pay you share the access code that unlocks the full course funnel. We're working on integrated payments — not yet ready.",
    },
    {
      q: "How do I prevent students from sharing the access code?",
      a: "Use single-use access codes (one code per student) so resharing breaks the link. Or use the access-code-per-email feature so the code only works for the registered email.",
    },
    {
      q: "Can I see student progress through the course?",
      a: "Yes. Each student's watch progress per lesson is in your dashboard. You can spot students who started the course but stalled at lesson 4 — those are the ones to message and re-engage.",
    },
    {
      q: "What if I want to switch to Teachable later?",
      a: "Your videos are yours — download them anytime. Move them to Teachable, Thinkific or Kajabi when you're ready. Most coaches we work with stay on Nevorai because it's faster and 10x cheaper, but you're never locked in.",
    },
  ],
  related: [
    { to: "/use-cases/network-marketing", label: "For MLM leaders" },
    { to: "/use-cases/insurance-agents", label: "For insurance agents" },
    { to: "/features", label: "All features" },
    { to: "/pricing", label: "Pricing" },
  ],
  ctaLabel: "Get Started — Built for Coaches",
};

export const Route = createFileRoute("/use-cases/coaches")({
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
