import { createLazyFileRoute } from "@tanstack/react-router";
import DownlinePage from "@/pages/DownlinePage";

export const Route = createLazyFileRoute("/downline")({
  component: DownlinePage,
});
