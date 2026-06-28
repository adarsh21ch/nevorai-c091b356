import { createLazyFileRoute } from "@tanstack/react-router";
import TrackingPage from "@/pages/TrackingPage";

export const Route = createLazyFileRoute("/tracking")({
  component: TrackingPage,
});
