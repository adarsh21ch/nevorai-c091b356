import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/landing-pages/")({
  component: LandingPagesPage,
});

function LandingPagesPage() {
  return import("@/pages/LandingPagesPage").then((d) => <d.default />);
}
