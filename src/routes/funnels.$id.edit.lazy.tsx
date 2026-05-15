import { createLazyFileRoute } from "@tanstack/react-router";
import FunnelEditor from "@/pages/FunnelEditor";

export const Route = createLazyFileRoute("/funnels/$id/edit")({
  component: FunnelEditor,
});
