import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAdminApplications,
  useAdminSearchUsers,
  useAdminCreateApplication,
  useAdminUpdateApplication,
  useAdminDeleteApplication,
  useAdminTransferApplication,
  type AdminApplication,
  type AdminUserPick,
} from "@/hooks/useApplicationsAdmin";
import { toast } from "sonner";
import { ExternalLink, Pencil, Trash2, UserPlus, Copy, Search, Plus } from "lucide-react";

export default function AdminApplicationsPage() {
  const { data: apps = [], isLoading, error, refetch } = useAdminApplications();
  const [openCreate, setOpenCreate] = useState(false);
  const [editApp, setEditApp] = useState<AdminApplication | null>(null);
  const [transferApp, setTransferApp] = useState<AdminApplication | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.owner_email || "").toLowerCase().includes(q) ||
        (a.owner_name || "").toLowerCase().includes(q)
    );
  }, [apps, filter]);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
            <p className="text-sm text-muted-foreground">
              Dedicated client sites. Each Application has its own subdomain and one owner client.
            </p>
          </div>
          <Button onClick={() => setOpenCreate(true)} className="gap-2">
            <Plus size={16} /> New Application
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, slug, or owner email…"
            className="pl-9"
          />
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </Card>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Application</th>
                <th className="px-3 py-2 text-left">Subdomain</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((app) => (
                <ApplicationRow
                  key={app.id}
                  app={app}
                  onEdit={() => setEditApp(app)}
                  onTransfer={() => setTransferApp(app)}
                  onRefresh={() => refetch()}
                />
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No applications yet. Click "New Application" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openCreate && <CreateDialog onClose={() => setOpenCreate(false)} />}
      {editApp && <EditDialog app={editApp} onClose={() => setEditApp(null)} />}
      {transferApp && <TransferDialog app={transferApp} onClose={() => setTransferApp(null)} />}
    </AdminLayout>
  );
}

function ApplicationRow({
  app,
  onEdit,
  onTransfer,
  onRefresh,
}: {
  app: AdminApplication;
  onEdit: () => void;
  onTransfer: () => void;
  onRefresh: () => void;
}) {
  const update = useAdminUpdateApplication();
  const del = useAdminDeleteApplication();
  const url = `https://${app.slug}.nevorai.com`;

  return (
    <tr>
      <td className="px-3 py-3">
        <div className="font-medium text-foreground">{app.name}</div>
        <div className="text-xs text-muted-foreground">
          Created {new Date(app.created_at).toLocaleDateString()}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{app.slug}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("URL copied");
            }}
            title="Copy URL"
            className="text-muted-foreground hover:text-foreground"
          >
            <Copy size={12} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Open"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-foreground">{app.owner_name || "—"}</div>
        <div className="text-xs text-muted-foreground">{app.owner_email || "—"}</div>
      </td>
      <td className="px-3 py-3">
        <Badge variant="secondary" className="capitalize">{app.plan}</Badge>
      </td>
      <td className="px-3 py-3">
        {app.deleted_at ? (
          <Badge variant="destructive">deleted</Badge>
        ) : app.status === "active" ? (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">active</Badge>
        ) : (
          <Badge variant="outline">{app.status}</Badge>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={app.allow_team_management}
            onCheckedChange={async (v) => {
              try {
                await update.mutateAsync({ id: app.id, allow_team: v });
                toast.success(v ? "Team management enabled" : "Team management disabled");
              } catch (e: any) {
                toast.error(e?.message || "Failed");
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {app.member_count} member{app.member_count === 1 ? "" : "s"}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onTransfer} title="Transfer owner">
            <UserPlus size={14} />
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edit">
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              if (!confirm(`Delete "${app.name}"? Existing data is kept but the app is suspended.`)) return;
              try {
                await del.mutateAsync(app.id);
                toast.success("Application deleted");
                onRefresh();
              } catch (e: any) {
                toast.error(e?.message || "Delete failed");
              }
            }}
            title="Delete"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function UserPicker({
  value,
  onChange,
  placeholder,
}: {
  value: AdminUserPick | null;
  onChange: (u: AdminUserPick | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const { data: results = [] } = useAdminSearchUsers(q);

  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder || "Search users by email or name…"}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {results.map((u) => {
          const selected = value?.id === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onChange(u)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${selected ? "bg-muted" : ""}`}
            >
              <div>
                <div className="font-medium">{u.full_name || u.username || u.email}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              {selected && <Badge>selected</Badge>}
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</div>
        )}
      </div>
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useAdminCreateApplication();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<"free" | "basic" | "pro">("free");
  const [allowTeam, setAllowTeam] = useState(false);
  const [owner, setOwner] = useState<AdminUserPick | null>(null);

  const submit = async () => {
    if (!owner) return toast.error("Pick an owner user");
    try {
      await create.mutateAsync({ name, slug, owner_id: owner.id, plan, allow_team: allowTeam });
      toast.success(`Application created at ${slug}.nevorai.com`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Create failed");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client display name" />
          </div>
          <div className="space-y-1.5">
            <Label>Subdomain</Label>
            <div className="flex items-center gap-2">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="client-name"
              />
              <span className="shrink-0 text-sm text-muted-foreground">.nevorai.com</span>
            </div>
            <p className="text-xs text-muted-foreground">3–40 chars, lowercase letters, numbers, hyphens.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={(v: any) => setPlan(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assign to user (owner)</Label>
            <UserPicker value={owner} onChange={setOwner} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Allow owner to manage team</div>
              <p className="text-xs text-muted-foreground">
                When on, the owner can add their own teammates from inside their app.
              </p>
            </div>
            <Switch checked={allowTeam} onCheckedChange={setAllowTeam} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim() || !slug.trim() || !owner}>
            {create.isPending ? "Creating…" : "Create Application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ app, onClose }: { app: AdminApplication; onClose: () => void }) {
  const update = useAdminUpdateApplication();
  const [name, setName] = useState(app.name);
  const [slug, setSlug] = useState(app.slug);
  const [plan, setPlan] = useState(app.plan);
  const [status, setStatus] = useState(app.status);

  const submit = async () => {
    try {
      await update.mutateAsync({
        id: app.id,
        name: name !== app.name ? name : undefined,
        slug: slug !== app.slug ? slug : undefined,
        plan: plan !== app.plan ? plan : undefined,
        status: status !== app.status ? status : undefined,
      });
      toast.success("Application updated");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Application</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Subdomain</Label>
            <div className="flex items-center gap-2">
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
              <span className="shrink-0 text-sm text-muted-foreground">.nevorai.com</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ app, onClose }: { app: AdminApplication; onClose: () => void }) {
  const transfer = useAdminTransferApplication();
  const [newOwner, setNewOwner] = useState<AdminUserPick | null>(null);

  const submit = async () => {
    if (!newOwner) return;
    try {
      await transfer.mutateAsync({ id: app.id, new_owner_id: newOwner.id });
      toast.success(`Ownership transferred to ${newOwner.email}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Transfer failed");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer "{app.name}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current owner: <span className="font-medium text-foreground">{app.owner_email || "—"}</span>.
            The previous owner will be demoted to admin.
          </p>
          <UserPicker value={newOwner} onChange={setNewOwner} placeholder="Search for the new owner…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!newOwner || transfer.isPending}>
            {transfer.isPending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
