import { createLazyFileRoute } from "@tanstack/react-router";
import FunnelInsightsPage from "@/pages/insights/FunnelInsightsPage";

export const Route = createLazyFileRoute("/insights/funnels/$id")({
  component: FunnelInsightsPage,
});
