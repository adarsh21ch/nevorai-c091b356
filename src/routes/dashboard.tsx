import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({}).lazy(() => import("./dashboard.lazy").then((d) => d.Route));
