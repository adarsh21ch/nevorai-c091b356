import { createLazyFileRoute } from "@tanstack/react-router";
import TrackingPage from "@/pages/TrackingPage";

export const Route = createLazyFileRoute("/_authenticated/tracking")({
  component: TrackingPage,
});
