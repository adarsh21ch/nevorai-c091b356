import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Plus, Trash2, Zap, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

const TRIGGER_LABELS: Record<string, string> = {
  funnel_lead_captured: "Funnel Lead Captured",
  user_signup: "User Signed Up",
  subscribed: "User Subscribed",
  trial_day1: "Trial — Day 1",
  trial_day3: "Trial — Day 3",
  trial_day5: "Trial — Day 5",
  trial_day7: "Trial — Day 7 (Final)",
  no_subscription_7d: "No Subscription After 7 Days",
  plan_expiring_3d: "Plan Expiring in 3 Days",
  plan_expired: "Plan Expired",
};
const TRIGGERS = Object.keys(TRIGGER_LABELS);

interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  is_active: boolean;
  total_enrolled: number;
  total_converted: number;
  created_at: string;
}

interface Step {
  id: string;
  automation_id: string;
  step_order: number;
  delay_hours: number;
  template_id: string | null;
  stop_if_subscribed: boolean;
}

interface TemplateLite {
  id: string;
  name: string;
  is_active: boolean;
}

function toAutomation(r: any): Automation {
  return {
    id: String(r.id),
    name: String(r.name),
    description: r.description ?? null,
    trigger_event: String(r.trigger_event),
    is_active: Boolean(r.is_active),
    total_enrolled: Number(r.total_enrolled || 0),
    total_converted: Number(r.total_converted || 0),
    created_at: String(r.created_at),
  };
}
function toStep(r: any): Step {
  return {
    id: String(r.id),
    automation_id: String(r.automation_id),
    step_order: Number(r.step_order),
    delay_hours: Number(r.delay_hours || 0),
    template_id: r.template_id ?? null,
    stop_if_subscribed: Boolean(r.stop_if_subscribed),
  };
}

function formatDelay(hours: number): string {
  if (hours === 0) return "Immediately";
  if (hours < 24) return `After ${hours}h`;
  const d = Math.round(hours / 24);
  return `After ${d} ${d === 1 ? "day" : "days"}`;
}

export function WhatsAppAutomationsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Automation | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ["whatsapp_automations"],
    queryFn: async (): Promise<Automation[]> => {
      const { data, error } = await supabase
        .from("whatsapp_automations" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(toAutomation);
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["whatsapp_templates_lite"],
    queryFn: async (): Promise<TemplateLite[]> => {
      const { data } = await supabase
        .from("whatsapp_templates" as any)
        .select("id, name, is_active")
        .order("name");
      return (Array.isArray(data) ? data : []).map((r: any) => ({
        id: String(r.id), name: String(r.name), is_active: Boolean(r.is_active),
      }));
    },
  });

  const toggleActive = async (a: Automation, next: boolean) => {
    if (next && !confirm("Activating will enroll matching users going forward. Continue?")) return;
    qc.setQueryData<Automation[]>(["whatsapp_automations"], (old) =>
      (old || []).map((x) => (x.id === a.id ? { ...x, is_active: next } : x)),
    );
    const { error } = await supabase
      .from("whatsapp_automations" as any)
      .update({ is_active: next })
      .eq("id", a.id);
    if (error) {
      toast.error("Failed");
      qc.invalidateQueries({ queryKey: ["whatsapp_automations"] });
    } else {
      toast.success(next ? "Activated" : "Paused");
    }
  };

  const newAutomation = (): Automation => ({
    id: "", name: "", description: "", trigger_event: "funnel_lead_captured",
    is_active: false, total_enrolled: 0, total_converted: 0, created_at: "",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Automations</h3>
          <p className="text-sm text-muted-foreground">
            Multi-step WhatsApp sequences triggered by user events.
          </p>
        </div>
        <Button onClick={() => { setEditing(newAutomation()); setCreating(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New automation
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (automations || []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Zap className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No automations yet.</p>
            <Button size="sm" onClick={() => { setEditing(newAutomation()); setCreating(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create your first automation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(automations || []).map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {a.name}
                      <Badge variant="outline">{TRIGGER_LABELS[a.trigger_event] || a.trigger_event}</Badge>
                    </CardTitle>
                    {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{a.total_enrolled}</span> enrolled ·{" "}
                      <span className="font-medium text-foreground">{a.total_converted}</span> converted
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={(v) => toggleActive(a, v)} />
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setCreating(false); }}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    >
                      {expandedId === a.id ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                      Steps
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedId === a.id && (
                <CardContent className="pt-0">
                  <StepsBuilder automationId={a.id} templates={templates || []} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <AutomationEditor
        automation={editing}
        creating={creating}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["whatsapp_automations"] });
        }}
      />
    </div>
  );
}

function AutomationEditor({
  automation, creating, onClose, onSaved,
}: {
  automation: Automation | null;
  creating: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("funnel_lead_captured");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!automation) return;
    setName(automation.name);
    setDescription(automation.description || "");
    setTrigger(automation.trigger_event);
    setIsActive(automation.is_active);
  }, [automation?.id, creating]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_event: trigger,
        is_active: isActive,
      };
      if (creating) {
        const { error } = await supabase.from("whatsapp_automations" as any).insert(payload);
        if (error) throw error;
        toast.success("Automation created");
      } else if (automation) {
        const { error } = await supabase
          .from("whatsapp_automations" as any)
          .update(payload)
          .eq("id", automation.id);
        if (error) throw error;
        toast.success("Saved");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!automation || creating) return;
    if (!confirm(`Delete "${automation.name}" and all its steps?`)) return;
    const { error } = await supabase.from("whatsapp_automations" as any).delete().eq("id", automation.id);
    if (error) toast.error("Failed");
    else { toast.success("Deleted"); onSaved(); }
  };

  return (
    <Sheet open={!!automation} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{creating ? "New automation" : "Edit automation"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Funnel Lead Nurture" />
          </div>
          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Trigger event</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Activating will enroll matching users going forward.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {creating ? "Create" : "Save"}
            </Button>
            {!creating && (
              <Button variant="outline" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StepsBuilder({
  automationId,
  templates,
}: {
  automationId: string;
  templates: TemplateLite[];
}) {
  const qc = useQueryClient();
  const { data: steps, isLoading } = useQuery({
    queryKey: ["whatsapp_automation_steps", automationId],
    queryFn: async (): Promise<Step[]> => {
      const { data, error } = await supabase
        .from("whatsapp_automation_steps" as any)
        .select("*")
        .eq("automation_id", automationId)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(toStep);
    },
  });

  const [delayValue, setDelayValue] = useState("0");
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">("hours");
  const [templateId, setTemplateId] = useState<string>("");
  const [stopIfSub, setStopIfSub] = useState(true);
  const [adding, setAdding] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["whatsapp_automation_steps", automationId] });

  const addStep = async () => {
    if (!templateId) { toast.error("Pick a template"); return; }
    const n = Math.max(0, Number(delayValue) || 0);
    const hours = delayUnit === "days" ? n * 24 : n;
    const nextOrder = (steps?.length || 0) + 1;
    setAdding(true);
    const { error } = await supabase.from("whatsapp_automation_steps" as any).insert({
      automation_id: automationId,
      step_order: nextOrder,
      delay_hours: hours,
      template_id: templateId,
      stop_if_subscribed: stopIfSub,
    });
    setAdding(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("Step added");
    setDelayValue("0"); setTemplateId(""); setStopIfSub(true);
    refresh();
  };

  const deleteStep = async (id: string) => {
    const { error } = await supabase.from("whatsapp_automation_steps" as any).delete().eq("id", id);
    if (error) toast.error("Failed"); else { toast.success("Removed"); refresh(); }
  };

  const toggleStopIfSub = async (s: Step, v: boolean) => {
    const { error } = await supabase
      .from("whatsapp_automation_steps" as any)
      .update({ stop_if_subscribed: v })
      .eq("id", s.id);
    if (error) toast.error("Failed"); else refresh();
  };

  const move = async (s: Step, dir: -1 | 1) => {
    const list = steps || [];
    const i = list.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    // swap step_order — do both updates
    await supabase.from("whatsapp_automation_steps" as any).update({ step_order: other.step_order }).eq("id", s.id);
    await supabase.from("whatsapp_automation_steps" as any).update({ step_order: s.step_order }).eq("id", other.id);
    refresh();
  };

  const templateName = (id: string | null) =>
    templates.find((t) => t.id === id)?.name || "(deleted template)";

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Steps</div>
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (steps || []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps yet. Add one below.</p>
      ) : (
        <div className="space-y-1">
          {(steps || []).map((s, idx) => (
            <div key={s.id} className="flex items-center gap-2 border rounded px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground w-12">#{idx + 1}</span>
              <Badge variant="secondary">{formatDelay(s.delay_hours)}</Badge>
              <span className="flex-1 truncate">{templateName(s.template_id)}</span>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Switch checked={s.stop_if_subscribed} onCheckedChange={(v) => toggleStopIfSub(s, v)} />
                <span className="hidden sm:inline">stop if subscribed</span>
              </label>
              <Button size="icon" variant="ghost" onClick={() => move(s, -1)} disabled={idx === 0}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => move(s, 1)} disabled={idx === (steps?.length || 1) - 1}>
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => deleteStep(s.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-2">
        <div className="text-xs font-medium">Add step</div>
        <div className="grid grid-cols-1 sm:grid-cols-[100px_120px_1fr] gap-2">
          <Input
            type="number"
            min={0}
            value={delayValue}
            onChange={(e) => setDelayValue(e.target.value)}
            placeholder="Delay"
          />
          <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as "hours" | "days")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="days">days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Pick a template…" /></SelectTrigger>
            <SelectContent>
              {templates.filter((t) => t.is_active).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={stopIfSub} onCheckedChange={setStopIfSub} />
            Stop if user subscribes
          </label>
          <Button size="sm" onClick={addStep} disabled={adding}>
            {adding && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            <Plus className="h-3 w-3 mr-1" /> Add step
          </Button>
        </div>
      </div>
    </div>
  );
}
