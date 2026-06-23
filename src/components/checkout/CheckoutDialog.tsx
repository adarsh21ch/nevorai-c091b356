import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Tag, X, Check, Shield } from "lucide-react";

interface CouponPreview {
  code: string;
  original_price: number;
  discounted_price: number;
  discount_label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;             // e.g. "Basic", "Pro" (display)
  planKey: string;              // e.g. "basic_monthly"
  billing: "monthly" | "yearly";
  basePrice: number;            // INR full price
  tierId?: string | null;
  loading: boolean;
  onConfirm: (args: { couponCode: string | null; finalPrice: number }) => void;
}

/**
 * Pre-checkout dialog: shows price, lets user apply an optional coupon code,
 * then triggers the real Razorpay flow via onConfirm with the negotiated price.
 */
export function CheckoutDialog({
  open, onOpenChange, planName, planKey, billing, basePrice, tierId, loading, onConfirm,
}: Props) {
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CouponPreview | null>(null);

  useEffect(() => {
    if (!open) {
      setCode(""); setError(null); setPreview(null); setApplying(false);
    }
  }, [open]);

  const handleApply = useCallback(async () => {
    const codeNorm = code.trim();
    if (!codeNorm) {
      setError("Enter a coupon code");
      return;
    }
    setApplying(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("razorpay-portal", {
        body: {
          action: "validate_coupon",
          coupon_code: codeNorm,
          plan_key: planKey,
          tier_id: tierId || null,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Could not validate coupon");
      if (!data?.valid) {
        setError(data?.error || "Invalid coupon");
        setPreview(null);
      } else {
        setPreview({
          code: data.code,
          original_price: Number(data.original_price),
          discounted_price: Number(data.discounted_price),
          discount_label: data.discount_label || "",
        });
      }
    } catch (e: any) {
      setError(e?.message || "Could not validate coupon");
    } finally {
      setApplying(false);
    }
  }, [code, planKey, tierId]);

  const handleRemove = () => {
    setPreview(null);
    setCode("");
    setError(null);
  };

  const finalPrice = preview ? preview.discounted_price : Math.round(basePrice);
  const unit = billing === "yearly" ? "/yr" : "/mo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe to {planName}</DialogTitle>
          <DialogDescription>
            Confirm your subscription. Have a coupon? Apply it below for a discount.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 bg-muted/30">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{planName} · {billing}</span>
              {preview ? (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground line-through">
                    ₹{preview.original_price}{unit}
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    ₹{preview.discounted_price}<span className="text-sm font-normal text-muted-foreground">{unit}</span>
                  </div>
                </div>
              ) : (
                <div className="text-2xl font-bold">
                  ₹{Math.round(basePrice)}<span className="text-sm font-normal text-muted-foreground">{unit}</span>
                </div>
              )}
            </div>
            {preview && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check size={12} /> {preview.code} · {preview.discount_label}
                </span>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-muted-foreground hover:text-foreground underline"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {!preview && (
            <div className="space-y-2">
              <label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Tag size={12} /> Coupon code (optional)
              </label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                  placeholder="e.g. LAUNCH50"
                  className="font-mono tracking-wider"
                  disabled={applying}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApply}
                  disabled={applying || !code.trim()}
                >
                  {applying ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
                </Button>
              </div>
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <X size={12} /> {error}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full gap-2"
            disabled={loading}
            onClick={() => onConfirm({
              couponCode: preview?.code || null,
              finalPrice,
            })}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Pay ₹{finalPrice}{unit}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <Shield size={10} className="text-emerald-500" /> Secure payment via Razorpay · UPI · Cards · NetBanking
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
