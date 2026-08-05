import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/landing-pages/")({
  component: () => import("@/pages/LandingPagesPage").then((d) => <d.default />),
});
