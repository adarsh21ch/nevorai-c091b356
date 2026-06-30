import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPixelHealth, checkPixelTestRun, type PixelHealthResult } from "@/lib/pixelHealth.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Props {
  scope: "funnel" | "landing";
  resourceId: string;
  /** Public URL used to fire the test event (e.g. https://flow.nevorai.com/f/my-slug). */
  publicUrl: string;
}

const STATUS_META: Record<
  PixelHealthResult["status"],
  { label: string; tone: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }
> = {
  healthy: {
    label: "Healthy",
    tone: "text-green-500 bg-green-500/10 border-green-500/30",
    icon: CheckCircle2,
    description: "Events are firing successfully.",
  },
  partial: {
    label: "Partial",
    tone: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    icon: AlertCircle,
    description: "Some events are failing. Likely ad-blockers or browser privacy settings.",
  },
  not_firing: {
    label: "Not firing",
    tone: "text-red-500 bg-red-500/10 border-red-500/30",
    icon: XCircle,
    description: "No events recorded in the last 24h. Test below to diagnose.",
  },
  fallback: {
    label: "Using platform pixel",
    tone: "text-blue-500 bg-blue-500/10 border-blue-500/30",
    icon: Activity,
    description: "Add your own Meta Pixel ID in the editor to track conversions in your ad account.",
  },
  unknown: {
    label: "Checking…",
    tone: "text-muted-foreground bg-muted border-border",
    icon: Loader2,
    description: "",
  },
};

export function PixelHealthCard({ scope, resourceId, publicUrl }: Props) {
  const getHealth = useServerFn(getPixelHealth);
  const checkRun = useServerFn(checkPixelTestRun);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pixel-health", scope, resourceId],
    queryFn: () => getHealth({ data: { scope, resourceId } }),
    refetchInterval: 30_000,
  });

  const [testOpen, setTestOpen] = useState(false);
  const [testState, setTestState] = useState<"idle" | "running" | "success" | "blocked" | "wrong" | "timeout">("idle");
  const [testDetail, setTestDetail] = useState<string>("");
  const [testEvents, setTestEvents] = useState<number>(0);

  const runVerifier = async () => {
    setTestOpen(true);
    setTestState("running");
    setTestDetail("Opening your public page in a hidden window…");
    setTestEvents(0);

    const runId = crypto.randomUUID();
    const url = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}nev_pixel_test_run=${runId}`;

    // Hidden iframe — sandboxed; we just need fbq + our fire-log ping to execute.
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;border:0";
    document.body.appendChild(iframe);

    const start = Date.now();
    const timeoutMs = 15_000;
    let cleared = false;

    const cleanup = () => {
      if (cleared) return;
      cleared = true;
      try {
        iframe.remove();
      } catch {}
    };

    const poll = async () => {
      try {
        const result = await checkRun({ data: { runId } });
        if (result.found) {
          setTestEvents(result.events.length);
          const anySuccess = result.events.some((e) => e.success);
          if (anySuccess) {
            setTestState("success");
            setTestDetail(
              result.pixelId
                ? `Events reaching pixel ${result.pixelId}. You're all set.`
                : "Events recorded on platform fallback pixel. Add your own Pixel ID for personal ad tracking.",
            );
            cleanup();
            refetch();
            return;
          }
          setTestState("blocked");
          setTestDetail("Events reached our server but fbq calls failed — usually means a browser ad-blocker is interfering on this device. Real visitors are unaffected.");
          cleanup();
          refetch();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          setTestState("timeout");
          setTestDetail(
            "We never saw the test event. Likely causes: page didn't publish, ad-blocker on this device, or the page failed to load. Try opening the public URL in a new tab.",
          );
          cleanup();
          return;
        }
        setTimeout(poll, 1500);
      } catch (err: any) {
        toast.error("Verifier failed: " + (err?.message ?? "unknown"));
        setTestState("timeout");
        setTestDetail("Verifier service hit an error. Try again in a moment.");
        cleanup();
      }
    };
    setTimeout(poll, 2000);
  };

  if (isLoading || !data) {
    return (
      <div className="glass-card p-5 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Checking pixel health…
      </div>
    );
  }

  // Defensive: if the server ever returns a status string the client bundle
  // doesn't know about (e.g. an older cached query result after a deploy, or
  // a new status added on the server but not yet shipped to this client),
  // fall back to "unknown" instead of crashing the entire page.
  const meta = STATUS_META[data.status] ?? STATUS_META.unknown;
  if (!STATUS_META[data.status]) {
    // Log so we can spot the unexpected status in production console.
    // eslint-disable-next-line no-console
    console.warn("[PixelHealthCard] Unknown pixel health status:", data.status, data);
  }
  const StatusIcon = meta.icon;
  // Defensive defaults — an old cached payload (pre-deploy) or a partial server
  // response may be missing these nested objects. Never let the dashboard crash.
  const last24h = data.last24h ?? { pageViews: 0, leads: 0, total: 0, successRate: 0 };
  const last7d = data.last7d ?? { total: 0 };
  const sparkline = data.sparkline ?? [];
  const recent = data.recent ?? [];
  const sparkMax = Math.max(1, ...sparkline.map((d) => d.count));

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${meta.tone}`}>
            <StatusIcon size={18} className={meta.icon === Loader2 ? "animate-spin" : ""} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-semibold text-sm">Meta Pixel Health</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${meta.tone}`}>
                {meta.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          </Button>
          <Button variant="hero" size="sm" onClick={runVerifier}>
            <Zap size={12} className="mr-1" /> Test now
          </Button>
        </div>
      </div>

      {/* Resolved pixel */}
      <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <span>
          Firing to:{" "}
          {data.resolvedPixelId ? (
            <span className="font-mono text-foreground">{data.resolvedPixelId}</span>
          ) : (
            <span className="text-foreground">platform pixel</span>
          )}
          {data.resolvedSource === "account" && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/30">
              account default
            </span>
          )}
          {data.resolvedSource === "this" && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
              {scope} override
            </span>
          )}
        </span>
        {data.resolvedPixelId && (
          <a
            href={`https://business.facebook.com/events_manager2/list/pixel/${data.resolvedPixelId}/overview`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Open in Meta <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "PageViews", value: last24h.pageViews },
          { label: "Leads", value: last24h.leads },
          { label: "Success", value: `${last24h.successRate}%` },
          { label: "Total 24h", value: last24h.total },
        ].map((k) => (
          <div key={k.label} className="bg-muted/40 rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
            <div className="font-heading font-bold text-base mt-0.5">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">Last 7 days · {data.last7d.total} events</div>
        <div className="flex items-end gap-1 h-10">
          {data.sparkline.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full bg-primary/60 rounded-sm transition-all"
                style={{ height: `${Math.max(2, (d.count / sparkMax) * 100)}%` }}
                title={`${d.day}: ${d.count}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Recent events */}
      {data.recent.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-3">
          <div className="text-[10px] text-muted-foreground mb-1">Recent events</div>
          {data.recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {r.success ? (
                  <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                ) : (
                  <XCircle size={11} className="text-red-500 shrink-0" />
                )}
                <span className="font-medium truncate">{r.event_name}</span>
              </div>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2 border-t border-border pt-3">
          No events in the last 24h. Hit <span className="font-medium">Test now</span> to verify setup.
        </div>
      )}

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testState === "running" && <Loader2 size={16} className="animate-spin text-primary" />}
              {testState === "success" && <CheckCircle2 size={18} className="text-green-500" />}
              {(testState === "blocked" || testState === "wrong") && <AlertCircle size={18} className="text-amber-500" />}
              {testState === "timeout" && <XCircle size={18} className="text-red-500" />}
              {testState === "running" && "Testing your pixel…"}
              {testState === "success" && "Pixel working perfectly"}
              {testState === "blocked" && "Pixel blocked on this device"}
              {testState === "wrong" && "Pixel ID looks wrong"}
              {testState === "timeout" && "No events received"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">{testDetail}</DialogDescription>
          </DialogHeader>
          {testEvents > 0 && (
            <p className="text-xs text-muted-foreground">{testEvents} event(s) recorded.</p>
          )}
          {testState === "timeout" && (
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Things to check:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Is the page published?</li>
                <li>Open the public URL in a normal browser tab — does it load?</li>
                <li>Try in a private/incognito window (ad-blockers off).</li>
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {testState !== "running" && (
              <Button variant="outline" size="sm" onClick={runVerifier}>
                <RefreshCw size={12} className="mr-1" /> Test again
              </Button>
            )}
            <Button variant="hero" size="sm" onClick={() => setTestOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
