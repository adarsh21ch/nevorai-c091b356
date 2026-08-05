import { createLazyFileRoute, redirect } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/profile" });
  },
});
