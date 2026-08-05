import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import UpdatesPage from "@/pages/UpdatesPage";

export const Route = createFileRoute("/updates")({
  component: () => (
    <DashboardLayout>
      <UpdatesPage />
    </DashboardLayout>
  ),
});
