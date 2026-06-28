import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyTrackingAccount,
  saveMyTrackingAccount,
  sendCapiTestEvent,
  getMyCapiDiagnostics,
  type TrackingAccountView,
  type CapiDiagnostics,
} from "@/lib/trackingAccount.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MetaPixelIdField } from "@/components/pixel/MetaPixelIdField";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Shield,
  Zap,
  AlertTriangle,
  Copy,
  RotateCw,
} from "lucide-react";

type TestResult = Awaited<ReturnType<typeof sendCapiTestEvent>>;

export default function TrackingPage() {
  useDocumentTitle("Tracking & Conversions API");

  const fetchAccount = useServerFn(getMyTrackingAccount);
  const saveAccount = useServerFn(saveMyTrackingAccount);
  const testEvent = useServerFn(sendCapiTestEvent);
  const fetchDiag = useServerFn(getMyCapiDiagnostics);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [account, setAccount] = useState<TrackingAccountView | null>(null);
  const [lastTest, setLastTest] = useState<TestResult | null>(null);
  const [diag, setDiag] = useState<CapiDiagnostics | null>(null);

  // Form state — `accessToken === ""` means "no change". User must explicitly type a value to update.
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [capiEnabled, setCapiEnabled] = useState(false);
  const [advancedMatching, setAdvancedMatching] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await fetchAccount();
      setAccount(data);
      if (data) {
        setPixelId(data.pixel_id ?? "");
        setTestEventCode(data.test_event_code ?? "");
        setCapiEnabled(data.capi_enabled);
        setAdvancedMatching(data.advanced_matching_enabled);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load tracking settings");
    } finally {
      setLoading(false);
    }
  }, [fetchAccount]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveAccount({
        data: {
          pixel_id: pixelId || null,
          // empty string = "keep existing token". Send the new value only when typed.
          access_token: accessToken === "" ? undefined : accessToken,
          test_event_code: testEventCode || null,
          capi_enabled: capiEnabled,
          advanced_matching_enabled: advancedMatching,
        },
      });
      setAccessToken(""); // clear local input after save
      toast.success("Tracking settings saved");
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setLastTest(null);
    try {
      const result = await testEvent({ data: { event_name: "PageView" } });
      setLastTest(result);
      if (result.ok) {
        toast.success(
          `CAPI test ok — Meta received ${result.events_received ?? 1} event in ${result.latency_ms}ms`,
        );
      } else {
        toast.error("CAPI test failed — see details below");
      }
      await reload();
    } catch (err: any) {
      toast.error(err?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  };

  // ----- Wizard step computation -----
  const hasPixel = !!(account?.pixel_id && account.pixel_id.length >= 15);
  const hasToken = !!account?.has_access_token;
  const capiOn = !!account?.capi_enabled;
  const tested = account?.last_test_status === "ok";

  const step =
    !hasPixel ? 1
    : !hasToken ? 2
    : !capiOn ? 3
    : !tested ? 4
    : 5;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Activity className="text-primary" size={22} />
            Tracking &amp; Conversions API
          </h1>
          <div className="page-header-accent" />
          <p className="text-sm text-muted-foreground mt-2">
            Connect your Meta Pixel and Conversions API so every visit, lead, and purchase reaches
            Meta — even when ad-blockers strip the browser pixel.
          </p>
        </div>

        {/* Wizard progress */}
        <div className="glass-card p-5">
          <div className="grid grid-cols-5 gap-2">
            {[
              { n: 1, label: "Pixel" },
              { n: 2, label: "CAPI token" },
              { n: 3, label: "Enable" },
              { n: 4, label: "Test" },
              { n: 5, label: "Live" },
            ].map((s) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <div key={s.n} className="flex flex-col items-center text-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border ${
                      done
                        ? "bg-green-500/15 border-green-500 text-green-500"
                        : active
                          ? "bg-primary/15 border-primary text-primary"
                          : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 size={16} /> : s.n}
                  </div>
                  <div className={`text-[11px] mt-1.5 ${active ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center text-muted-foreground">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Loading…
          </div>
        ) : (
          <>
            {/* Configuration card */}
            <div className="glass-card p-5 space-y-5">
              <div>
                <h2 className="text-base font-heading font-semibold flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  Configuration
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Your access token is encrypted at rest and never sent to the browser. Only Meta sees it.
                </p>
              </div>

              <MetaPixelIdField
                value={pixelId}
                onChange={setPixelId}
                scope="account"
              />

              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shield size={14} className="text-primary" />
                  Conversions API access token
                  {hasToken && (
                    <span className="text-[11px] font-normal text-green-500 ml-1">
                      saved: {account?.access_token_preview}
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={hasToken ? "Leave blank to keep existing token" : "EAAB..."}
                  autoComplete="off"
                  className="bg-muted border-border font-mono text-xs mt-1.5"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Generate from{" "}
                  <a
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                    href={
                      pixelId
                        ? `https://business.facebook.com/events_manager2/list/pixel/${pixelId}/settings`
                        : "https://business.facebook.com/events_manager2/list/pixel"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Events Manager → Settings → Conversions API → Generate access token <ExternalLink size={10} />
                  </a>
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium">Test event code (optional)</Label>
                <Input
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                  placeholder="TEST12345"
                  className="bg-muted border-border font-mono mt-1.5"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  When set, events show up in Meta Events Manager → Test Events tab instead of going live.
                  Remove this code once you're ready to go live.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40">
                <div>
                  <div className="text-sm font-medium">Enable Conversions API</div>
                  <div className="text-[11px] text-muted-foreground">
                    Mirror every browser event to Meta server-side using the same event ID for dedupe.
                  </div>
                </div>
                <Switch checked={capiEnabled} onCheckedChange={setCapiEnabled} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40">
                <div>
                  <div className="text-sm font-medium">Advanced matching</div>
                  <div className="text-[11px] text-muted-foreground">
                    Hash and send email / phone / external_id with each event to improve match quality.
                  </div>
                </div>
                <Switch checked={advancedMatching} onCheckedChange={setAdvancedMatching} />
              </div>

              <div className="flex gap-2">
                <Button onClick={onSave} disabled={saving}>
                  {saving && <Loader2 className="animate-spin mr-2" size={14} />}
                  Save settings
                </Button>
                <Button
                  variant="outline"
                  onClick={onTest}
                  disabled={testing || !hasPixel || !hasToken || !capiOn}
                >
                  {testing && <Loader2 className="animate-spin mr-2" size={14} />}
                  Send test event
                </Button>
              </div>

              {!capiOn && hasPixel && hasToken && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    Token saved but CAPI is disabled. Turn on "Enable Conversions API" above so events start firing.
                  </div>
                </div>
              )}
            </div>

            {/* Last test result */}
            {(lastTest || account?.last_test_at) && (
              <div className="glass-card p-5">
                <h2 className="text-base font-heading font-semibold flex items-center gap-2 mb-3">
                  {((lastTest?.ok ?? false) || account?.last_test_status === "ok") ? (
                    <CheckCircle2 size={16} className="text-green-500" />
                  ) : (
                    <XCircle size={16} className="text-red-500" />
                  )}
                  Last test result
                </h2>
                <pre className="text-[11px] bg-muted p-3 rounded-lg overflow-x-auto max-h-72">
{JSON.stringify(lastTest ?? account?.last_test_response, null, 2)}
                </pre>
                {(lastTest?.test_event_code_used || account?.test_event_code) && pixelId && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    See it in Meta:{" "}
                    <a
                      href={`https://business.facebook.com/events_manager2/list/pixel/${pixelId}/test_events`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Test Events for pixel {pixelId} <ExternalLink size={10} />
                    </a>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
