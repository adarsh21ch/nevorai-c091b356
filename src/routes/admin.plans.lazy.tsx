import { createLazyFileRoute } from "@tanstack/react-router";
import AdminPlansPage from "@/pages/AdminPlansPage";

export const Route = createLazyFileRoute("/admin/plans")({
  component: AdminPlansPage,
});
