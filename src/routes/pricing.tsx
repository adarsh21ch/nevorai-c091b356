import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Nevorai Pricing — Plans built for growing creators";
const DESCRIPTION =
  "Simple, transparent pricing for the smarter way to share business videos. Pick the plan that fits your growth. UPI, cards and net banking via Razorpay.";
const URL = "https://nevorai.com/pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
});
