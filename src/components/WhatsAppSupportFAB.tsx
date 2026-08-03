import { MessageCircle } from "lucide-react";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { Button } from "@/components/ui/button";

export const WhatsAppSupportFAB = () => {
  const { supportPhone, openSupport } = useWhatsAppSupport();

  if (!supportPhone) return null;

  return (
    <Button
      onClick={() => openSupport()}
      className="fixed bottom-20 md:bottom-6 right-6 z-50 rounded-full w-14 h-14 shadow-lg bg-green-600 hover:bg-green-700 text-white p-0"
      aria-label="WhatsApp Support"
    >
      <MessageCircle size={24} />
    </Button>
  );
};
