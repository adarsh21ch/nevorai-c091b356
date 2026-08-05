import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tools")({
  component: () => import("@/pages/ToolsPage").then((d) => <d.default />),
});
