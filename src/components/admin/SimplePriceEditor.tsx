import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "@/lib/adminWrite";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader2, IndianRupee } from "lucide-react";

/**
 * Simple pricing editor — replaces the old "View Limit Tiers" table.
 *
 * We no longer sell tiered daily-view caps, so admins only need to set the
 * plain monthly / yearly price for each plan. To stay backward-compatible
 * with public pricing readers that still query `plan_tiers` (base row), we
 * upsert a single base tier per plan alongside writing
 * `subscription_plans.price_monthly / price_yearly`.
 */
export const SimplePriceEditor = ({ planName }: { planName: string }) => {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["plan-simple-pricing", planName],
    queryFn: async () => {
      const [{ data: planRow }, { data: tierRow }] = await Promise.all([
        (supabase.from("subscription_plans") as any)
          .select("monthly_price, yearly_price")
          .eq("plan_name", planName)
          .maybeSingle(),
        (supabase.from("plan_tiers" as any) as any)
          .select("id, monthly_price, yearly_price")
          .eq("plan_name", planName)
          .order("is_base", { ascending: false })
          .order("display_order", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        monthly: planRow?.monthly_price ?? tierRow?.monthly_price ?? 0,
        yearly: planRow?.yearly_price ?? tierRow?.yearly_price ?? 0,
        tierId: tierRow?.id ?? null,
      };
    },
    staleTime: 30_000,
  });


  const [monthly, setMonthly] = useState<number | "">("");
  const [yearly, setYearly] = useState<number | "">("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty && data) {
      setMonthly(Number(data.monthly) || 0);
      setYearly(Number(data.yearly) || 0);
    }
  }, [data, dirty]);

  const suggestedYearly = typeof monthly === "number" ? Math.round(monthly * 12 * 0.83) : 0;

  const save = async () => {
    if (typeof monthly !== "number" || monthly < 0) {
      toast.error("Monthly price is required");
      return;
    }
    const y = typeof yearly === "number" && yearly > 0 ? yearly : suggestedYearly;
    setSaving(true);
    try {
      const { error: e1 } = await adminWrite(() =>
        (supabase.from("subscription_plans") as any)
          .update({
            price_monthly: monthly,
            price_yearly: y,
            updated_at: new Date().toISOString(),
          })
          .eq("plan_name", planName)
          .select(),
      );
      if (e1) throw e1;

      // Mirror to plan_tiers base row so legacy readers keep working.
      if (data?.tierId) {
        await adminWrite(() =>
          (supabase.from("plan_tiers" as any) as any)
            .update({
              monthly_price: monthly,
              yearly_price: y,
              is_base: true,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.tierId)
            .select(),
          { expectRows: false },
        );
      } else {
        await adminWrite(() =>
          (supabase.from("plan_tiers" as any) as any)
            .insert({
              plan_name: planName,
              daily_views: -1,
              monthly_views: -1,
              monthly_price: monthly,
              yearly_price: y,
              is_active: true,
              is_base: true,
              display_order: 1,
            } as any)
            .select(),
          { expectRows: false },
        );
      }

      toast.success("Pricing updated");
      setDirty(false);
      ["plan-simple-pricing", "plans", "admin-plan-configs", "plan-configs", "plan-pricing", "billing-tier-plans", "plan-view-tiers-public", "plan-configs-landing"]
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-t border-border pt-3 mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Loading pricing…
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border pt-3 mt-2">
      <div className="flex items-center gap-2">
        <IndianRupee size={12} className="text-primary" />
        <h4 className="text-xs font-semibold">Pricing</h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Monthly ₹</Label>
          <NumberInput
            min={0}
            prefix="₹"
            value={monthly}
            onValueChange={(n) => {
              setMonthly(n === "" ? "" : Number(n));
              setDirty(true);
            }}
            className="h-8 text-xs"
            placeholder="249"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Yearly ₹ {typeof monthly === "number" && monthly > 0 && (
              <span className="opacity-60">(≈ {suggestedYearly.toLocaleString("en-IN")})</span>
            )}
          </Label>
          <NumberInput
            min={0}
            prefix="₹"
            value={yearly}
            onValueChange={(n) => {
              setYearly(n === "" ? "" : Number(n));
              setDirty(true);
            }}
            className="h-8 text-xs"
            placeholder={String(suggestedYearly || 2490)}
          />
        </div>
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save price
          </Button>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground italic">
        This is the single price customers see on the billing & pricing pages. Yearly auto-suggests a 17% discount.
      </p>
    </div>
  );
};
