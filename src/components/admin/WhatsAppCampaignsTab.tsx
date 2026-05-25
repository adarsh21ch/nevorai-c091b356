import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Send, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { TemplatePreview } from "./whatsapp/TemplatePreview";

type Segment = "all" | "trial" | "free" | "basic" | "pro" | "no_subscription";
type Status = "draft" | "scheduled" | "sending" | "sent" | "failed";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "All Users" },
  { value: "trial", label: "Trial Users" },
  { value: "free", label: "Free Users" },
  { value: "basic", label: "Basic Plan" },
  { value: "pro", label: "Pro Plan" },
  { value: "no_subscription", label: "Never Subscribed" },
];

const STATUS_COLOR: Record<Status, string> = {
  draft: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  scheduled: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  sending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
};

interface Campaign {
  id: string;
  name: string;
  template_id: string | null;
  target_segment: Segment;
  scheduled_at: string | null;
  status: Status;
  sent_count: number;
  failed_count: number;
  total_audience: number;
  created_at: string;
}

interface TemplateLite {
  id: string;
  name: string;
  body: string;
  is_active: boolean;
}

function toCampaign(r: any): Campaign {
  return {
    id: String(r.id),
    name: String(r.name),
    template_id: r.template_id ?? null,
    target_segment: (r.target_segment || "all") as Segment,
    scheduled_at: r.scheduled_at ?? null,
    status: (r.status || "draft") as Status,
    sent_count: Number(r.sent_count || 0),
    failed_count: Number(r.failed_count || 0),
    total_audience: Number(r.total_audience || 0),
    created_at: String(r.created_at),
  };
}

// Build the segment filter onto a profiles query
function applySegment(q: any, segment: Segment) {
  // require a whatsapp phone to be reachable
  let query = q.not("whatsapp_phone", "is", null);
  switch (segment) {
    case "trial":
      return query.eq("subscription_status", "trial");
    case "basic":
      return query.eq("plan_tier", "basic").eq("subscription_status", "active");
    case "pro":
      return query.eq("plan_tier", "pro").eq("subscription_status", "active");
    case "free":
      return query.or("plan_tier.eq.free,plan_tier.is.null");
    case "no_subscription":
      return query.is("subscription_status", null);
    case "all":
    default:
      return query;
  }
}

export function WhatsAppCampaignsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["whatsapp_campaigns"],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(toCampaign);
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["whatsapp_templates_full"],
    queryFn: async (): Promise<TemplateLite[]> => {
      const { data } = await supabase
        .from("whatsapp_templates" as any)
        .select("id, name, body, is_active")
        .order("name");
      return (Array.isArray(data) ? data : []).map((r: any) => ({
        id: String(r.id), name: String(r.name), body: String(r.body), is_active: Boolean(r.is_active),
      }));
    },
  });

  const templateName = (id: string | null) =>
    templates?.find((t) => t.id === id)?.name || "—";

  const newCampaign = (): Campaign => ({
    id: "", name: "", template_id: null, target_segment: "all",
    scheduled_at: null, status: "draft",
    sent_count: 0, failed_count: 0, total_audience: 0, created_at: "",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Campaigns</h3>
          <p className="text-sm text-muted-foreground">
            One-time broadcasts to a user segment.
          </p>
        </div>
        <Button onClick={() => { setEditing(newCampaign()); setCreating(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (campaigns || []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            <Button size="sm" onClick={() => { setEditing(newCampaign()); setCreating(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create your first campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="hidden md:table-cell">Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Scheduled</TableHead>
                  <TableHead className="hidden md:table-cell">Sent / Failed</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns || []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {SEGMENTS.find((s) => s.value === c.target_segment)?.label || c.target_segment}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{templateName(c.template_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[c.status]}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {c.sent_count} / <span className="text-red-500">{c.failed_count}</span>
                      {c.total_audience > 0 && (
                        <span className="text-muted-foreground"> · of {c.total_audience}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setCreating(false); }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CampaignEditor
        campaign={editing}
        creating={creating}
        templates={templates || []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["whatsapp_campaigns"] });
        }}
      />
    </div>
  );
}

function CampaignEditor({
  campaign, creating, templates, onClose, onSaved,
}: {
  campaign: Campaign | null;
  creating: boolean;
  templates: TemplateLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [segment, setSegment] = useState<Segment>("all");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [audience, setAudience] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setName(campaign.name);
    setTemplateId(campaign.template_id || "");
    setSegment(campaign.target_segment);
    if (campaign.scheduled_at) {
      setScheduleMode("later");
      // datetime-local needs YYYY-MM-DDTHH:mm
      const d = new Date(campaign.scheduled_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduledAt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    } else {
      setScheduleMode("now");
      setScheduledAt("");
    }
  }, [campaign?.id, creating]);

  // Estimate audience whenever segment changes
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    setLoadingAudience(true);
    (async () => {
      const q = supabase.from("profiles" as any).select("*", { count: "exact", head: true });
      const filtered = applySegment(q, segment);
      const { count, error } = await filtered;
      if (cancelled) return;
      setLoadingAudience(false);
      if (error) {
        setAudience(null);
      } else {
        setAudience(count || 0);
      }
    })();
    return () => { cancelled = true; };
  }, [segment, campaign?.id]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const readOnly = !creating && campaign?.status !== "draft";

  const buildPayload = (status: Status, computedAudience: number) => ({
    name: name.trim(),
    template_id: templateId,
    target_segment: segment,
    scheduled_at: scheduleMode === "later" ? new Date(scheduledAt).toISOString() : null,
    status,
    total_audience: computedAudience,
  });

  const save = async (status: Status) => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!templateId) { toast.error("Pick a template"); return; }
    if (scheduleMode === "later" && !scheduledAt) { toast.error("Pick a date/time"); return; }
    setSaving(true);
    try {
      const payload = buildPayload(status, audience || 0);
      if (creating) {
        const { error } = await supabase.from("whatsapp_campaigns" as any).insert(payload);
        if (error) throw error;
      } else if (campaign) {
        const { error } = await supabase
          .from("whatsapp_campaigns" as any)
          .update(payload)
          .eq("id", campaign.id);
        if (error) throw error;
      }
      toast.success(
        status === "draft" ? "Saved as draft"
        : status === "scheduled" ? "Scheduled"
        : "Queued for sending",
      );
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!campaign || creating) return;
    if (!confirm(`Delete "${campaign.name}"?`)) return;
    const { error } = await supabase.from("whatsapp_campaigns" as any).delete().eq("id", campaign.id);
    if (error) toast.error("Failed"); else { toast.success("Deleted"); onSaved(); }
  };

  return (
    <Sheet open={!!campaign} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{creating ? "New campaign" : campaign?.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {!creating && campaign && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Sent</div>
                <div className="font-semibold">{campaign.sent_count}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Failed</div>
                <div className="font-semibold text-red-500">{campaign.failed_count}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-xs text-muted-foreground">Audience</div>
                <div className="font-semibold">{campaign.total_audience}</div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder="June launch broadcast" />
          </div>

          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Pick a template…" /></SelectTrigger>
              <SelectContent>
                {templates.filter((t) => t.is_active).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Target segment</Label>
            <Select value={segment} onValueChange={(v) => setSegment(v as Segment)} disabled={readOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground pt-1">
              {loadingAudience ? "Calculating…" : audience !== null ? `~${audience} users will receive this` : "—"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Schedule</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={scheduleMode === "now"}
                  onChange={() => setScheduleMode("now")}
                  disabled={readOnly}
                />
                Send now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={scheduleMode === "later"}
                  onChange={() => setScheduleMode("later")}
                  disabled={readOnly}
                />
                Schedule for later
              </label>
              {scheduleMode === "later" && (
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  disabled={readOnly}
                />
              )}
            </div>
          </div>

          {selectedTemplate && (
            <div className="space-y-1">
              <Label>Preview</Label>
              <TemplatePreview body={selectedTemplate.body} />
            </div>
          )}

          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
                Save as draft
              </Button>
              {scheduleMode === "later" ? (
                <Button onClick={() => save("scheduled")} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Schedule
                </Button>
              ) : (
                <Button onClick={() => save("sending")} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <Send className="h-4 w-4 mr-2" /> Send now
                </Button>
              )}
              {!creating && (
                <Button variant="ghost" onClick={handleDelete} className="ml-auto text-red-500">
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
