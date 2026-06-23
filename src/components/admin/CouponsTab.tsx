import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminWrite } from "@/lib/adminWrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Tag, Trash2, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Coupon {
  id: string;
  code: string;
  plan_name: string | null;
  tier_id: string | null;
  billing_cycle: "monthly" | "yearly" | "both";
  discount_type: "percent" | "fixed_price";
  discount_value: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  redemption_count?: number;
}

interface Tier {
  id: string;
  plan_name: string;
  daily_views: number;
  monthly_price: number;
}

const initialForm = {
  code: "",
  plan_name: "any",         // 'any' | 'basic' | 'pro' | <other>
  tier_id: "any",           // 'any' | tier-uuid
  billing_cycle: "both" as "monthly" | "yearly" | "both",
  discount_type: "percent" as "percent" | "fixed_price",
  discount_value: "",
  expires_at: "",
  is_active: true,
};

export const CouponsTab = () => {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["plan-coupons-admin"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plan_coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as Coupon[];

      // Fetch redemption counts in one shot
      if (rows.length) {
        const ids = rows.map(r => r.id);
        const { data: reds } = await (supabase as any)
          .from("coupon_redemptions")
          .select("coupon_id")
          .in("coupon_id", ids);
        const counts = new Map<string, number>();
        (reds || []).forEach((r: any) => counts.set(r.coupon_id, (counts.get(r.coupon_id) || 0) + 1));
        rows.forEach(r => { r.redemption_count = counts.get(r.id) || 0; });
      }
      return rows;
    },
  });

  const { data: planNames = [] } = useQuery({
    queryKey: ["plan-names-for-coupons"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_plans")
        .select("plan_name")
        .neq("plan_name", "free");
      return ((data || []) as { plan_name: string }[]).map(p => p.plan_name);
    },
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["plan-tiers-for-coupons", form.plan_name],
    queryFn: async () => {
      if (form.plan_name === "any") return [];
      const { data } = await (supabase as any)
        .from("plan_tiers")
        .select("id, plan_name, daily_views, monthly_price")
        .eq("plan_name", form.plan_name)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      return (data || []) as Tier[];
    },
    enabled: form.plan_name !== "any",
  });

  const reset = () => setForm(initialForm);

  const submit = async () => {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      toast.error("Code must be 3-40 chars, letters/digits/_/- only.");
      return;
    }
    const value = parseFloat(form.discount_value);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Discount value must be a positive number.");
      return;
    }
    if (form.discount_type === "percent" && value >= 100) {
      toast.error("Percent must be less than 100.");
      return;
    }
    const expires = form.expires_at ? new Date(form.expires_at).toISOString() : null;
    if (form.expires_at && expires && new Date(expires).getTime() < Date.now()) {
      toast.error("Expiry must be in the future.");
      return;
    }

    setSaving(true);
    const { error } = await adminWrite(() =>
      (supabase.from("plan_coupons" as any) as any).insert({
        code,
        plan_name: form.plan_name === "any" ? null : form.plan_name,
        tier_id: form.tier_id === "any" ? null : form.tier_id,
        billing_cycle: form.billing_cycle,
        discount_type: form.discount_type,
        discount_value: value,
        expires_at: expires,
        is_active: form.is_active,
      }).select(),
    );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to create coupon");
      return;
    }
    toast.success(`Coupon ${code} created`);
    qc.invalidateQueries({ queryKey: ["plan-coupons-admin"] });
    reset();
    setOpen(false);
  };

  const toggleActive = async (c: Coupon, value: boolean) => {
    const { error } = await adminWrite(() =>
      (supabase.from("plan_coupons" as any) as any)
        .update({ is_active: value })
        .eq("id", c.id).select(),
    );
    if (error) toast.error(error.message);
    else {
      toast.success(value ? "Coupon enabled" : "Coupon disabled");
      qc.invalidateQueries({ queryKey: ["plan-coupons-admin"] });
    }
  };

  const remove = async (c: Coupon) => {
    const ok = await confirm({
      title: `Delete coupon "${c.code}"?`,
      description: `This removes the coupon and its ${c.redemption_count || 0} redemption record(s). Past payments are not affected.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await adminWrite(() =>
      (supabase.from("plan_coupons" as any) as any).delete().eq("id", c.id).select(),
      { expectRows: false },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Coupon deleted");
      qc.invalidateQueries({ queryKey: ["plan-coupons-admin"] });
    }
  };

  const formatCoupon = (c: Coupon) => {
    if (c.discount_type === "percent") return `${c.discount_value}% off`;
    return `Final ₹${c.discount_value}`;
  };

  const statusOf = (c: Coupon): { label: string; cls: string } => {
    if (!c.is_active) return { label: "Disabled", cls: "bg-muted text-muted-foreground" };
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      return { label: "Expired", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    }
    return { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-heading font-bold sm:text-lg">Coupon Codes</h2>
          <p className="text-xs text-muted-foreground">
            Create discount codes for plan checkout. One redemption per user.
          </p>
        </div>
        <Button size="sm" onClick={() => { reset(); setOpen(true); }} className="gap-1.5">
          <Plus size={14} /> New Coupon
        </Button>
      </div>

      {isLoading ? (
        <div className="glass-card p-6 text-sm text-muted-foreground">Loading coupons…</div>
      ) : coupons.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <Tag size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No coupons yet. Create one to share with your audience.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Discount</th>
                  <th className="text-left px-3 py-2">Plan / Tier</th>
                  <th className="text-left px-3 py-2">Cycle</th>
                  <th className="text-left px-3 py-2">Expires</th>
                  <th className="text-left px-3 py-2">Uses</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => {
                  const s = statusOf(c);
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
                      <td className="px-3 py-2">{formatCoupon(c)}</td>
                      <td className="px-3 py-2 capitalize">
                        {c.plan_name || "Any"}
                        {c.tier_id && <span className="text-muted-foreground text-xs"> · specific tier</span>}
                      </td>
                      <td className="px-3 py-2 capitalize">{c.billing_cycle}</td>
                      <td className="px-3 py-2">
                        {c.expires_at ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Calendar size={11} />
                            {format(new Date(c.expires_at), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 text-xs">
                          <Users size={11} /> {c.redemption_count || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={c.is_active}
                            onCheckedChange={(v) => toggleActive(c, v)}
                          />
                          <button
                            onClick={() => remove(c)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Coupon</DialogTitle>
            <DialogDescription>Discount applies at checkout. One use per user.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH50"
                className="font-mono tracking-wider mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Plan</Label>
                <Select value={form.plan_name} onValueChange={(v) => setForm({ ...form, plan_name: v, tier_id: "any" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any plan</SelectItem>
                    {planNames.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tier</Label>
                <Select
                  value={form.tier_id}
                  onValueChange={(v) => setForm({ ...form, tier_id: v })}
                  disabled={form.plan_name === "any"}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any tier</SelectItem>
                    {tiers.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.daily_views === -1 ? "Unlimited" : t.daily_views} views/day · ₹{t.monthly_price}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Billing cycle</Label>
                <Select value={form.billing_cycle} onValueChange={(v: any) => setForm({ ...form, billing_cycle: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Monthly & Yearly</SelectItem>
                    <SelectItem value="monthly">Monthly only</SelectItem>
                    <SelectItem value="yearly">Yearly only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Discount type</Label>
                <Select value={form.discount_type} onValueChange={(v: any) => setForm({ ...form, discount_type: v, discount_value: "" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent off (%)</SelectItem>
                    <SelectItem value="fixed_price">Fixed final price (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">
                {form.discount_type === "percent" ? "Percent off (1-99)" : "Final price after coupon (₹)"}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                placeholder={form.discount_type === "percent" ? "50" : "1970"}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {form.discount_type === "percent"
                  ? "Example: 50 = customer pays 50% of the plan price."
                  : "Example: 1970 = customer pays ₹1,970 total instead of the regular tier price."}
              </p>
            </div>

            <div>
              <Label className="text-xs">Expiry (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label className="text-xs">Active</Label>
                <p className="text-[10px] text-muted-foreground">Off = coupon can't be redeemed.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              Create coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
