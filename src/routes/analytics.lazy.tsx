import { createLazyFileRoute, redirect } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/insights" });
  },
});
