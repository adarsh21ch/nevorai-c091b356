import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tools")({
  component: ToolsPage,
});

function ToolsPage() {
  return import("@/pages/ToolsPage").then((d) => <d.default />);
}
