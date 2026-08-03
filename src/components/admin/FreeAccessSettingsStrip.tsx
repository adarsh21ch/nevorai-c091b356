import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Lock, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

const KEYS = ["free_access_enabled", "free_access_grace_days", "free_access_disabled_at"];

/**
 * Admin master toggle for free-tier account access. When OFF, creators without
 * a paid plan / active trial / manual grant keep working for `graceDays` days
 * (measured from the moment the admin flipped it off), then their shared
 * videos stop playing for prospects.
 */
export const FreeAccessSettingsStrip = () => {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["app-settings-free-access-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings" as any)
        .select("key, value")
        .in("key", KEYS);
      return data || [];
    },
  });

  const [enabled, setEnabled] = useState(true);
  const [graceDays, setGraceDays] = useState(3);
  const [disabledAt, setDisabledAt] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    (data as any[] | undefined)?.forEach((s: any) => {
      if (s.key === "free_access_enabled") setEnabled(s.value !== "false");
      if (s.key === "free_access_grace_days") setGraceDays(parseInt(s.value, 10) || 3);
      if (s.key === "free_access_disabled_at") setDisabledAt(s.value || "");
    });
  }, [data]);

  const save = async (nextEnabled: boolean, nextGrace: number) => {
    setSaving(true);
    // Track transitions: ON→OFF stamps disabled_at, OFF→ON clears it.
    let nextDisabledAt = disabledAt;
    if (enabled && !nextEnabled) nextDisabledAt = new Date().toISOString();
    if (!enabled && nextEnabled) nextDisabledAt = "";

    const { error } = await supabase.from("app_settings" as any).upsert(
      [
        { key: "free_access_enabled", value: String(nextEnabled) },
        { key: "free_access_grace_days", value: String(nextGrace) },
        { key: "free_access_disabled_at", value: nextDisabledAt },
      ],
      { onConflict: "key" }
    );
    setSaving(false);
    if (error) {
      toast.error("Failed to save free-access settings");
      return;
    }
    setDisabledAt(nextDisabledAt);
    setSavedAt(Date.now());
    qc.invalidateQueries({ queryKey: ["app-settings-free-access-admin"] });
    qc.invalidateQueries({ queryKey: ["app-settings-free-access"] });
    toast.success("Free-access settings saved");
    setTimeout(() => setSavedAt(0), 2500);
  };

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    save(v, graceDays);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 mt-4">
      <div className="flex items-center gap-2 min-w-[140px]">
        <Lock size={15} className="text-primary" />
        <span className="text-sm font-semibold">Free Plan Access</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Grace</span>
        <input
          type="number"
          min={0}
          max={60}
          value={graceDays}
          onChange={(e) => setGraceDays(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
          onBlur={() => save(enabled, graceDays)}
          className="w-14 h-8 text-center rounded-md bg-muted border border-border text-sm font-semibold"
        />
        <span className="text-[11px] text-muted-foreground">days</span>
      </div>

      <p className="basis-full text-[11px] text-muted-foreground leading-relaxed">
        When OFF, creators without an active paid plan or trial keep working for{" "}
        <strong>{graceDays}</strong> {graceDays === 1 ? "day" : "days"}, then their shared videos
        stop playing until they upgrade.
        {!enabled && disabledAt && (
          <>
            {" "}Disabled at{" "}
            <strong>{new Date(disabledAt).toLocaleString()}</strong>. Grace ends{" "}
            <strong>
              {new Date(
                Date.parse(disabledAt) + graceDays * 86_400_000
              ).toLocaleString()}
            </strong>
            .
          </>
        )}
      </p>

      <div className="ml-auto">
        {saving ? (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Saving
          </span>
        ) : savedAt ? (
          <span className="text-[11px] text-primary flex items-center gap-1">
            <Check size={12} /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
};
