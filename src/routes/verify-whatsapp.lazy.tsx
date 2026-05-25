import { createLazyFileRoute } from "@tanstack/react-router";
import VerifyWhatsAppPage from "@/pages/VerifyWhatsAppPage";

export const Route = createLazyFileRoute("/verify-whatsapp")({
  component: VerifyWhatsAppPage,
});
