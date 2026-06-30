import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useWorkspaceBranding, useUpdateWorkspaceBranding } from "@/hooks/useWorkspaceBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace-branding")({
  head: () => ({
    meta: [
      { title: "Workspace branding" },
      { name: "description", content: "Set your workspace name, logo, colors and favicon." },
    ],
  }),
  component: WorkspaceBrandingPage,
});

function WorkspaceBrandingPage() {
  const { activeWorkspaceId, activeWorkspace } = useActiveWorkspace();
  const { data: branding, isLoading } = useWorkspaceBranding(activeWorkspaceId);
  const { mutateAsync, isPending } = useUpdateWorkspaceBranding(activeWorkspaceId);

  const [form, setForm] = useState({
    app_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "",
    secondary_color: "",
    theme_color: "",
    email_from_name: "",
  });

  useEffect(() => {
    if (!branding) return;
    setForm({
      app_name: branding.app_name ?? "",
      logo_url: branding.logo_url ?? "",
      favicon_url: branding.favicon_url ?? "",
      primary_color: branding.primary_color ?? "",
      secondary_color: branding.secondary_color ?? "",
      theme_color: branding.theme_color ?? "",
      email_from_name: branding.email_from_name ?? "",
    });
  }, [branding]);

  const onSave = async () => {
    if (!activeWorkspaceId) return;
    try {
      await mutateAsync({
        app_name: form.app_name.trim() || null,
        logo_url: form.logo_url.trim() || null,
        favicon_url: form.favicon_url.trim() || null,
        primary_color: form.primary_color.trim() || null,
        secondary_color: form.secondary_color.trim() || null,
        theme_color: form.theme_color.trim() || null,
        email_from_name: form.email_from_name.trim() || null,
      });
      toast.success("Branding saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save branding");
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace branding</h1>
          <p className="text-sm text-muted-foreground">
            Customise how <span className="font-medium">{activeWorkspace?.name ?? "your workspace"}</span> looks across the app.
          </p>
        </div>

        <Card className="space-y-4 p-6">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <Field label="App name" value={form.app_name} onChange={(v) => setForm({ ...form, app_name: v })} placeholder={activeWorkspace?.name ?? "My App"} />
              <Field label="Logo URL" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} placeholder="https://…/logo.png" />
              <Field label="Favicon URL" value={form.favicon_url} onChange={(v) => setForm({ ...form, favicon_url: v })} placeholder="https://…/favicon.ico" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ColorField label="Primary" value={form.primary_color} onChange={(v) => setForm({ ...form, primary_color: v })} />
                <ColorField label="Secondary" value={form.secondary_color} onChange={(v) => setForm({ ...form, secondary_color: v })} />
                <ColorField label="Theme" value={form.theme_color} onChange={(v) => setForm({ ...form, theme_color: v })} />
              </div>
              <Field label="Email From name" value={form.email_from_name} onChange={(v) => setForm({ ...form, email_from_name: v })} placeholder="Acme Team" />

              <div className="flex justify-end pt-2">
                <Button onClick={onSave} disabled={isPending || !activeWorkspaceId}>
                  {isPending ? "Saving…" : "Save branding"}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#3B82F6" />
      </div>
    </div>
  );
}
