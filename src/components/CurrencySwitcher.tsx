import { Globe } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

export const CurrencySwitcher = () => {
  const { currency, setCurrency } = useCurrency();

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-1 py-1">
      <Globe size={14} className="text-muted-foreground ml-2" />
      <button
        onClick={() => setCurrency("INR")}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
          currency === "INR"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Switch to Indian Rupees"
      >
        ₹ INR
      </button>
      <button
        onClick={() => setCurrency("USD")}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
          currency === "USD"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Switch to US Dollars"
      >
        $ USD
      </button>
    </div>
  );
};
