import { createLazyFileRoute } from "@tanstack/react-router";
import AdminApplicationsPage from "@/pages/AdminApplicationsPage";

export const Route = createLazyFileRoute("/admin/applications")({
  component: AdminApplicationsPage,
});
