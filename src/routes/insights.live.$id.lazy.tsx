import { createLazyFileRoute } from "@tanstack/react-router";
import LiveInsightsPage from "@/pages/insights/LiveInsightsPage";

export const Route = createLazyFileRoute("/insights/live/$id")({
  component: LiveInsightsPage,
});
