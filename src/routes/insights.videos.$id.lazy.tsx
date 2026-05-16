import { createLazyFileRoute } from "@tanstack/react-router";
import VideoInsightsPage from "@/pages/insights/VideoInsightsPage";

export const Route = createLazyFileRoute("/insights/videos/$id")({
  component: VideoInsightsPage,
});
