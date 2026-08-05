import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/analytics")({
  loader: () => {
    throw redirect({ to: "/insights" });
  },
});
