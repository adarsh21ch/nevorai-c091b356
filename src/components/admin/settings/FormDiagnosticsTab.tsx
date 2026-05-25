import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, supabaseProjectUrl } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  submitted_at: string;
  email: string | null;
  name: string | null;
  landing_page_id: string;
  owner_id: string;
  confirmation_email_sent: boolean | null;
  email_send_log: any;
  landing_pages?: { name?: string | null; sender_display_name?: string | null } | null;
  profiles?: { full_name?: string | null; email?: string | null; subscription_status?: string | null } | null;
};

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const statusFor = (r: Row): { label: string; tone: "ok" | "fail" | "skip"; reason?: string } => {
  const log = r.email_send_log || {};
  if (log.sent) return { label: "Sent", tone: "ok" };
  if (log.reason === "plan_upgrade_required") return { label: "Skipped — plan blocked", tone: "skip", reason: log.reason };
  if (log.reason === "disabled_on_page" || log.reason === "Email disabled") return { label: "Skipped — disabled", tone: "skip", reason: log.reason };
  if (log.reason === "no_email_provided" || log.reason === "No email") return { label: "Skipped — no email", tone: "skip", reason: log.reason };
  if (log.attempted === false && !log.reason) {
    if (r.confirmation_email_sent) return { label: "Sent", tone: "ok" };
    return { label: "Skipped", tone: "skip" };
  }
  return { label: "Failed", tone: "fail", reason: log.reason || "unknown" };
};

export const FormDiagnosticsTab = () => {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-landing-form-diagnostics"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_page_registrations")
        .select(`
          id, submitted_at, email, name, landing_page_id, owner_id,
          confirmation_email_sent, email_send_log,
          landing_pages:landing_page_id ( name, sender_display_name ),
          profiles:owner_id ( full_name, email, subscription_status )
        `)
        .order("submitted_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const retry = useMutation({
    mutationFn: async (registration_id: string) => {
      setRetryingId(registration_id);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseProjectUrl}/functions/v1/resend-landing-page-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ registration_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return json;
    },
    onSuccess: (json) => {
      setRetryingId(null);
      if (json?.email_delivery?.sent) toast.success("Email re-sent successfully");
      else toast.error(`Retry result: ${json?.email_delivery?.reason || "not sent"}`);
      queryClient.invalidateQueries({ queryKey: ["admin-landing-form-diagnostics"] });
    },
    onError: (e: any) => {
      setRetryingId(null);
      toast.error(`Retry failed: ${e?.message || "unknown"}`);
    },
  });

  const counts = useMemo(() => {
    const out = { sent: 0, failed: 0, skipped: 0 };
    rows.forEach((r) => {
      const s = statusFor(r);
      if (s.tone === "ok") out.sent++;
      else if (s.tone === "fail") out.failed++;
      else out.skipped++;
    });
    return out;
  }, [rows]);

  return (
    <div className="glass-card p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-heading font-semibold sm:text-base">Landing form diagnostics</h2>
          <p className="text-[11px] text-muted-foreground sm:text-xs">Last 100 prospect submissions across all creators.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Sent</div>
          <div className="text-base font-semibold text-green-500">{counts.sent}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Failed</div>
          <div className="text-base font-semibold text-red-500">{counts.failed}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Skipped</div>
          <div className="text-base font-semibold text-amber-500">{counts.skipped}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No registrations yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-[11px] sm:text-xs min-w-[900px]">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2 font-medium">Time</th>
                <th className="text-left py-2 px-2 font-medium">Creator</th>
                <th className="text-left py-2 px-2 font-medium">Plan</th>
                <th className="text-left py-2 px-2 font-medium">Landing page</th>
                <th className="text-left py-2 px-2 font-medium">Prospect</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Reason</th>
                <th className="text-right py-2 px-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = statusFor(r);
                const log = r.email_send_log || {};
                const plan = log.resolved_plan_name || r.profiles?.subscription_status || "—";
                const creator = r.profiles?.full_name || r.profiles?.email || r.owner_id.slice(0, 8);
                const pageName = r.landing_pages?.name || r.landing_page_id.slice(0, 8);
                const icon = s.tone === "ok" ? <CheckCircle2 size={12} className="text-green-500" />
                  : s.tone === "fail" ? <XCircle size={12} className="text-red-500" />
                  : <MinusCircle size={12} className="text-amber-500" />;
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{fmt(r.submitted_at)}</td>
                    <td className="py-2 px-2 truncate max-w-[160px]">{creator}</td>
                    <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{plan}</Badge></td>
                    <td className="py-2 px-2 truncate max-w-[180px]">{pageName}</td>
                    <td className="py-2 px-2 truncate max-w-[200px]">{r.email || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 px-2">
                      <span className="inline-flex items-center gap-1">{icon}{s.label}</span>
                    </td>
                    <td className="py-2 px-2 truncate max-w-[200px] text-muted-foreground">{s.reason || (log.sent ? "ok" : "")}</td>
                    <td className="py-2 px-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={retry.isPending && retryingId === r.id || !r.email}
                        onClick={() => retry.mutate(r.id)}
                      >
                        {retry.isPending && retryingId === r.id
                          ? <><Loader2 size={11} className="animate-spin" /> Retrying</>
                          : <>Retry email</>}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FormDiagnosticsTab;
