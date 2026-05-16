import { createLazyFileRoute } from "@tanstack/react-router";
import LandingPageInsightsPage from "@/pages/insights/LandingPageInsightsPage";

export const Route = createLazyFileRoute("/insights/landing-pages/$id")({
  component: LandingPageInsightsPage,
});
