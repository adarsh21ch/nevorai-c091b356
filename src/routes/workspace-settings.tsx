import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRenameWorkspace, useChangeWorkspaceSlug } from "@/hooks/useWorkspaceSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace-settings")({
  head: () => ({ meta: [{ title: "Tenant settings" }] }),
  component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
  const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
  const rename = useRenameWorkspace();
  const changeSlug = useChangeWorkspaceSlug();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const isOwner = activeWorkspace?.role === "owner";
  const isOwnerOrAdmin = isOwner || activeWorkspace?.role === "admin";

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setSlug(activeWorkspace.slug);
    }
  }, [activeWorkspace?.workspace_id]);

  const saveName = async () => {
    if (!activeWorkspaceId) return;
    try {
      await rename.mutateAsync({ workspaceId: activeWorkspaceId, name });
      toast.success("Tenant renamed");
    } catch (e: any) { toast.error(e?.message || "Rename failed"); }
  };

  const saveSlug = async () => {
    if (!activeWorkspaceId) return;
    try {
      await changeSlug.mutateAsync({ workspaceId: activeWorkspaceId, slug });
      toast.success("Slug updated");
    } catch (e: any) { toast.error(e?.message || "Slug change failed"); }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenant settings</h1>
          <p className="text-sm text-muted-foreground">Manage your tenant name and subdomain.</p>
        </div>

        <Card className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Tenant name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwnerOrAdmin} />
            <p className="text-xs text-muted-foreground">Shown in the app and on shared links.</p>
            <div className="pt-2">
              <Button size="sm" onClick={saveName} disabled={!isOwnerOrAdmin || rename.isPending || !name.trim() || name === activeWorkspace?.name}>
                {rename.isPending ? "Saving…" : "Save name"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Subdomain (slug)</Label>
            <div className="flex items-center gap-2">
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} disabled={!isOwner} />
              <span className="shrink-0 text-sm text-muted-foreground">.nevorai.com</span>
            </div>
            <p className="text-xs text-muted-foreground">
              3–40 chars, lowercase letters, numbers and hyphens. Changing this breaks existing share links.
              Only the workspace owner can change this.
            </p>
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={saveSlug} disabled={!isOwner || changeSlug.isPending || !slug.trim() || slug === activeWorkspace?.slug}>
                {changeSlug.isPending ? "Saving…" : "Change slug"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
