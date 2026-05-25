import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATE_VARIABLES, renderTemplate } from "./whatsapp/variables";
import { TemplatePreview } from "./whatsapp/TemplatePreview";

const CATEGORIES = ["nurture", "onboarding", "retention", "broadcast", "support"] as const;
type Category = (typeof CATEGORIES)[number];

interface Template {
  id: string;
  name: string;
  body: string;
  media_key: string | null;
  category: Category;
  is_active: boolean;
  created_at: string;
}

interface MediaOption {
  key: string;
  label: string;
}

function toTemplate(row: any): Template {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    body: String(row?.body ?? ""),
    media_key: typeof row?.media_key === "string" ? row.media_key : null,
    category: (CATEGORIES.includes(row?.category) ? row.category : "nurture") as Category,
    is_active: Boolean(row?.is_active),
    created_at: String(row?.created_at ?? ""),
  };
}

const CATEGORY_BADGE: Record<Category, string> = {
  nurture: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  onboarding: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  retention: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  broadcast: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  support: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

export function WhatsAppTemplatesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp_templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("whatsapp_templates" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(toTemplate);
    },
  });

  const { data: mediaOptions } = useQuery({
    queryKey: ["whatsapp_media_keys"],
    queryFn: async (): Promise<MediaOption[]> => {
      const { data } = await supabase
        .from("whatsapp_media" as any)
        .select("key, label, is_active")
        .eq("is_active", true)
        .order("key");
      return (Array.isArray(data) ? data : []).map((r: any) => ({
        key: String(r.key),
        label: String(r.label || r.key),
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return templates || [];
    return (templates || []).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [templates, debounced]);

  const toggleActive = async (t: Template, next: boolean) => {
    qc.setQueryData<Template[]>(["whatsapp_templates"], (old) =>
      (old || []).map((x) => (x.id === t.id ? { ...x, is_active: next } : x)),
    );
    const { error } = await supabase
      .from("whatsapp_templates" as any)
      .update({ is_active: next })
      .eq("id", t.id);
    if (error) {
      toast.error("Failed to update");
      qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
    } else {
      toast.success(next ? "Activated" : "Deactivated");
    }
  };

  const newTemplate = (): Template => ({
    id: "",
    name: "",
    body: "",
    media_key: null,
    category: "nurture",
    is_active: true,
    created_at: "",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Message Templates</h3>
          <p className="text-sm text-muted-foreground">
            Reusable WhatsApp messages used by automations and campaigns.
          </p>
        </div>
        <Button onClick={() => { setEditing(newTemplate()); setCreating(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New template
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No templates yet.</p>
            <Button size="sm" onClick={() => { setEditing(newTemplate()); setCreating(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create your first template
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
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden md:table-cell">Preview</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CATEGORY_BADGE[t.category]}>
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-md truncate">
                      {t.body.slice(0, 60)}{t.body.length > 60 ? "…" : ""}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={(v) => toggleActive(t, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(t); setCreating(false); }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <TemplateEditor
        template={editing}
        creating={creating}
        mediaOptions={mediaOptions || []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
        }}
      />
    </div>
  );
}

function TemplateEditor({
  template,
  creating,
  mediaOptions,
  onClose,
  onSaved,
}: {
  template: Template | null;
  creating: boolean;
  mediaOptions: MediaOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("nurture");
  const [mediaKey, setMediaKey] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setBody(template.body);
    setCategory(template.category);
    setMediaKey(template.media_key || "none");
    setIsActive(template.is_active);
  }, [template?.id, creating]);

  const insertVariable = (key: string) => {
    const ta = textareaRef.current;
    const token = `{{${key}}}`;
    if (!ta) {
      setBody((b) => b + token);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        body: body.trim(),
        category,
        media_key: mediaKey !== "none" ? mediaKey : null,
        is_active: isActive,
      };
      if (creating) {
        const { error } = await supabase.from("whatsapp_templates" as any).insert(payload);
        if (error) throw error;
        toast.success("Template created");
      } else if (template) {
        const { error } = await supabase
          .from("whatsapp_templates" as any)
          .update(payload)
          .eq("id", template.id);
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
    if (!template || creating) return;
    if (!confirm(`Delete "${template.name}"?`)) return;
    const { error } = await supabase.from("whatsapp_templates" as any).delete().eq("id", template.id);
    if (error) {
      toast.error("Failed to delete (it may be used by an automation)");
    } else {
      toast.success("Deleted");
      onSaved();
    }
  };

  return (
    <Sheet open={!!template} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{creating ? "New template" : "Edit template"}</SheetTitle>
        </SheetHeader>

        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome - Funnel Lead" />
            </div>

            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Body</Label>
              <Textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Hi {{name}}, welcome to Nevorai..."
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[11px] px-2 py-1 border rounded hover:bg-muted transition"
                  >
                    + {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Media (optional)</Label>
              <Select value={mediaKey} onValueChange={setMediaKey}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {mediaOptions.map((m) => (
                    <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive templates can't be used by automations.</p>
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

          <div className="space-y-2">
            <Label>Live preview</Label>
            <TemplatePreview body={body} />
            <p className="text-[11px] text-muted-foreground">
              Sample values: name=Rahul · plan=Pro · expiry=30 Jun 2026 · link=nevorai.com · days_left=3
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
