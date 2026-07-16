import { createFileRoute } from "@tanstack/react-router";
import { ComparePage, type CompareContent } from "@/components/landing/SeoPageLayouts";

const URL = "https://nevorai.com/compare/nevorai-vs-google-drive";
const TITLE = "Nevorai vs Google Drive — Why Sharing Video on Drive Doesn't Work";
const DESCRIPTION =
  "Google Drive is a file locker, not a video platform. No tracking, no lead capture, broken WhatsApp previews. See why business videos belong on Nevorai instead.";

const content: CompareContent = {
  competitor: "Google Drive",
  hero: {
    titleStart: "Nevorai vs Google Drive —",
    titleAccent: "why sharing video on Drive doesn't work.",
    subtitle:
      "Google Drive is brilliant for storing PDFs and Excel sheets. It's the wrong tool for sharing a sales video with a prospect on WhatsApp — and here's exactly why.",
  },
  intro: [
    "Almost every Indian small business has done it: shot a sales video on the phone, uploaded to Google Drive, copied the share link, pasted it into a WhatsApp chat. It seems free and easy. It's also one of the worst possible ways to share a business video.",
    "Drive is a file storage tool. Google built it to share documents between teammates, not to deliver sales videos to prospects. The result: broken previews on WhatsApp, prospects forced to download a 200 MB file, no idea who actually watched, and zero way to capture a lead.",
    "Nevorai is purpose-built for exactly this job. Smart preview links, in-browser playback, real-time tracking, and lead capture — at the same 'free to start' price.",
  ],
  rows: [
    { feature: "Plays in browser without download", nevorai: true, other: "Sometimes — depends on file size" },
    { feature: "Proper WhatsApp share preview", nevorai: true, other: false },
    { feature: "Real-time viewer activity feed", nevorai: true, other: false },
    { feature: "Know who watched and how much", nevorai: true, other: false },
    { feature: "Built-in lead capture form", nevorai: true, other: false },
    { feature: "Unskippable / locked seek bar", nevorai: true, other: false },
    { feature: "Multi-step video funnel", nevorai: true, other: false },
    { feature: "Branded share page", nevorai: true, other: "Generic Drive UI" },
    { feature: "Access codes / gated content", nevorai: true, other: "Public or invite-only only" },
    { feature: "Adaptive streaming for slow internet", nevorai: true, other: false },
    { feature: "Mobile playback experience", nevorai: "Optimised", other: "Buffers, asks to download" },
    { feature: "Entry pricing", nevorai: "₹249/mo Starter plan", other: "15 GB free (shared with Gmail + Photos)" },
    { feature: "General file storage", nevorai: false, other: true },
    { feature: "Document collaboration", nevorai: false, other: true },
  ],
  whyParagraphs: [
    {
      title: "WhatsApp previews are broken",
      body: "When you paste a Google Drive video link in WhatsApp, the preview is a generic Drive icon with no thumbnail and no title. Most prospects scroll past it because it looks like spam. Nevorai's smart links produce a proper preview card with your branding and a video thumbnail — way higher tap rate.",
    },
    {
      title: "Drive forces downloads, Nevorai streams",
      body: "Beyond a certain file size, Google Drive asks the viewer to download the entire video before watching. On 4G in tier-2 India, that's a 5-minute wait for a 100 MB file. Most prospects abandon. Nevorai uses adaptive streaming — the video starts in 2 seconds at the right quality for their connection.",
    },
    {
      title: "Zero tracking means zero follow-up intelligence",
      body: "Drive shows you 'view count' on a folder, sometimes. It doesn't tell you which contact watched, how much, or when. So you call every prospect with the same 'did you watch?' question. Nevorai's activity feed turns that guesswork into a sorted list of warm leads.",
    },
    {
      title: "No lead capture, no funnel, no growth",
      body: "Drive is a static file. The viewer watches and leaves — no form, no next step, no way to collect their phone number. Nevorai turns the same video into a converting funnel with a lead form, a CTA, and an unlock for the next step.",
    },
  ],
  honest: "Keep using Google Drive for what it's brilliant at — storing PDFs, sharing spreadsheets with your team, backing up documents, and originals of your raw video files. Just don't deliver sales videos to prospects through Drive links. The two tools complement each other: Drive for storage, Nevorai for prospect-facing video.",
  faq: [
    {
      q: "Can't I just share the Drive link with 'anyone with the link can view'?",
      a: "You can, but the experience is poor. WhatsApp previews don't render properly, mobile users often have to download the file, you can't capture leads, and you can't see who watched. The link technically works — the conversion is what fails.",
    },
    {
      q: "What about Google Drive's view count?",
      a: "Drive sometimes shows a total view count, but it doesn't tell you which contacts viewed or how much they watched. You can't sort prospects by interest level or call the warm ones first. For a sales process, that's the data that actually matters.",
    },
    {
      q: "Is my Nevorai video as secure as Google Drive?",
      a: "Yes. Videos are stored on encrypted cloud storage, served over secure HTTPS, and you can lock any video behind an access code so only invited prospects watch. For most business sales videos this is more secure than a Drive link that anyone can forward.",
    },
    {
      q: "Can I move my existing videos from Drive to Nevorai?",
      a: "Yes — download from Drive, upload to Nevorai, copy the new smart link, and replace the old Drive link in your WhatsApp templates. Takes about 10 minutes per video and you immediately get tracking and lead capture on every view.",
    },
    {
      q: "Why is Nevorai better than Google Drive for live sessions?",
      a: "Drive doesn't do live sessions at all — it's a file locker. Nevorai lets you schedule a recorded video to play live at a fixed time so multiple prospects watch together with full tracking. Closest Google equivalent is Google Meet, which is a different tool entirely.",
    },
  ],
};

export const Route = createFileRoute("/compare/nevorai-vs-google-drive")({
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
