import { createFileRoute } from "@tanstack/react-router";
import { UseCasePage, type UseCaseContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/use-cases/real-estate";
const TITLE = "Property Video Sharing for Real Estate Agents | Nevorai";
const DESCRIPTION =
  "Show properties to buyers and know exactly who's interested. Real-time tracking, lead capture and WhatsApp share — built for real estate agents and property dealers in India.";

const content: UseCaseContent = {
  hero: {
    eyebrow: "For real estate agents & property dealers",
    titleStart: "Show properties to buyers —",
    titleAccent: "know exactly who's interested.",
    subtitle:
      "Stop guessing which buyer actually watched your property walkthrough. Send a smart Nevorai link on WhatsApp, see who watched the full tour, and call only the buyers who're ready to visit.",
  },
  problem: {
    title: "Why real estate is broken on WhatsApp and YouTube",
    paragraphs: [
      "You shoot a 4-minute property walkthrough on your phone — kitchen, bedrooms, balcony view, society amenities. You forward it to 80 prospective buyers on WhatsApp. Three reply 'nice'. Two ask the price. Seventy-five never open the video. You have no idea which is which, so on Monday morning you call all 80, sound desperate, and burn through your contact list.",
      "If you upload the same walkthrough to YouTube, your buyer ends up watching three competitor properties in the same locality before tapping 'contact agent' on someone else's listing. YouTube doesn't care that you spent the morning shooting that video — it just wants more watch time.",
      "Real estate runs on attention and timing. The buyer who watched your full walkthrough this morning will buy something this month. If you don't know who they are, your competitor will get the call.",
    ],
  },
  solution: {
    title: "How Nevorai works for property agents",
    bullets: [
      {
        heading: "One smart link per property",
        body: "Each property gets its own Nevorai link with the walkthrough, photos and floor plan. Share the same link with all your buyers — WhatsApp, Facebook, Instagram, your website.",
      },
      {
        heading: "Real-time buyer activity",
        body: "See every buyer who watched, exactly how much they watched, and on what device. A buyer who watched the full 4-minute walkthrough twice is ready for a site visit.",
      },
      {
        heading: "Capture name, phone, locality preference",
        body: "Lead form collects what you need to qualify the buyer — budget range, locality, timeline. Conversion rates 3-5x higher than asking on WhatsApp.",
      },
      {
        heading: "Multi-property funnel",
        body: "Build a funnel that walks the buyer through 3-4 properties matching their criteria. They watch all of them in one sitting and you know which one they spent the most time on.",
      },
      {
        heading: "Locked premium listings",
        body: "Off-market or premium properties can be locked with an access code. Only verified buyers get the code via WhatsApp.",
      },
      {
        heading: "Live virtual property tours",
        body: "Schedule a live walkthrough at a fixed time — 20 buyers join the same link, you narrate over the recorded video, every attendee submits their details.",
      },
    ],
  },
  workflow: {
    title: "Step by step: how property agents use Nevorai",
    steps: [
      {
        title: "Shoot a 3-5 minute walkthrough",
        body: "Phone is fine. Walk slowly through every room. Show the view from the balcony. End with the building amenities and parking. Don't talk price in the video — let the form capture intent.",
      },
      {
        title: "Upload to Nevorai with property name as the title",
        body: "Use 'Lodha Belmondo, 3BHK, Pune' style titles. The Nevorai page becomes a mini-listing page that ranks for the property name.",
      },
      {
        title: "Add a lead form with budget + locality + timeline",
        body: "Three quick questions. Show the form after the walkthrough ends — buyer is at peak interest then.",
      },
      {
        title: "Share the link with your buyer database",
        body: "WhatsApp broadcast to 100 buyers. The Nevorai preview card looks like a real listing, not spam. Open rates 5x higher than a raw video file.",
      },
      {
        title: "Filter by watch percentage every evening",
        body: "Anyone who watched 80%+ goes on tomorrow's call list. Anyone who watched and filled the form gets a same-day call. Skip the cold contacts.",
      },
      {
        title: "Send a follow-up funnel with similar properties",
        body: "Buyer watched the 3BHK but their budget is for 2BHK? Send them a multi-property Nevorai funnel with three matching 2BHK options. They watch them all in one go.",
      },
      {
        title: "Use live tours for new project launches",
        body: "Builder launching a new tower? Schedule a Nevorai live session, broadcast the link to your buyer base, and capture leads at scale without flying everyone to the site.",
      },
    ],
  },
  faq: [
    {
      q: "Can I share the same link with multiple buyers?",
      a: "Yes — that's the whole point. One link per property, share with as many buyers as you want. Each buyer shows up separately in your activity feed so you can track every prospect individually.",
    },
    {
      q: "What if the property gets sold? Can I take the link down?",
      a: "Just unpublish the funnel from your Nevorai dashboard. The link will show a 'this property is no longer available' message. Old buyers who tap it can be redirected to similar listings.",
    },
    {
      q: "Can I add the floor plan and photos too?",
      a: "Yes. Each Nevorai funnel can include images, downloadable floor plans, and links alongside the video. Think of it as a single-property landing page that you can build in 5 minutes.",
    },
    {
      q: "How is this better than 99acres or MagicBricks?",
      a: "Listing portals connect you to cold buyers and charge per lead. Nevorai is for the warm buyers you already have — your existing WhatsApp database, social media followers, past clients. The two work together: portals bring new leads, Nevorai converts them.",
    },
    {
      q: "Can my full team use one Nevorai account?",
      a: "Each agent should have their own free account so they see their own buyer activity. The Pro plan supports team workspaces if you want centralised reporting across multiple agents.",
    },
  ],
  related: [
    { to: "/use-cases/insurance-agents", label: "For insurance agents" },
    { to: "/use-cases/network-marketing", label: "For MLM leaders" },
    { to: "/features", label: "All features" },
    { to: "/pricing", label: "Pricing" },
  ],
  ctaLabel: "Start Free — Built for Property Agents",
};

export const Route = createFileRoute("/use-cases/real-estate")({
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
