import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Trash2, FileText, Image as ImageIcon, File as FileIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";

export type MaterialEntityType =
  | "funnel"
  | "funnel_step"
  | "landing_page"
  | "live_session"
  | "video";

const BUCKET = "content-materials";
const MAX_MB = 25;

const iconFor = (mime?: string) => {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  return FileIcon;
};

const prettySize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * MaterialsManager — creator-side uploader/list for downloadable resources
 * attached to a funnel, funnel step, landing page, live session, or video.
 */
export const MaterialsManager = ({
  entityType,
  entityId,
  title = "Resources & Materials",
  description = "Upload PDFs, images, or documents your viewers can download (max 25MB each).",
}: {
  entityType: MaterialEntityType;
  entityId: string;
  title?: string;
  description?: string;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [customTitle, setCustomTitle] = useState("");

  const queryKey = ["content-materials", entityType, entityId];

  const { data: materials = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("content_materials")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!entityId,
  });

  const remove = useMutation({
    mutationFn: async (m: any) => {
      // Best-effort delete from storage (path is derived from URL)
      try {
        const url = new URL(m.file_url);
        const idx = url.pathname.indexOf(`/${BUCKET}/`);
        if (idx >= 0) {
          const path = url.pathname.slice(idx + BUCKET.length + 2);
          await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
        }
      } catch {}
      const { error } = await (supabase as any)
        .from("content_materials")
        .delete()
        .eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e.message || "Failed to remove"),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${entityType}/${entityId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { error: insErr } = await (supabase as any).from("content_materials").insert({
        owner_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        title: (customTitle || file.name).slice(0, 200),
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        position: (materials as any[]).length,
      });
      if (insErr) throw insErr;

      setCustomTitle("");
      queryClient.invalidateQueries({ queryKey });
      toast.success("Material uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Paperclip size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{description}</p>

      <div className="space-y-2">
        <Label className="text-xs">Title (optional)</Label>
        <Input
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder="e.g. Workshop notes"
          maxLength={200}
        />
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip"
          onChange={handleUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !entityId}
          className="w-full"
        >
          {uploading ? (
            <><Loader2 size={14} className="animate-spin mr-1.5" /> Uploading…</>
          ) : (
            <><Upload size={14} className="mr-1.5" /> Upload file</>
          )}
        </Button>
      </div>

      <div className="space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (materials as any[]).length === 0 ? (
          <p className="text-xs text-muted-foreground">No materials yet.</p>
        ) : (
          (materials as any[]).map((m) => {
            const Icon = iconFor(m.mime_type);
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <Icon size={16} className="text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.file_name} {m.file_size ? `· ${prettySize(m.file_size)}` : ""}
                  </p>
                </div>
                <a
                  href={m.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline px-2"
                >
                  View
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => remove.mutate(m)}
                  disabled={remove.isPending}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MaterialsManager;
