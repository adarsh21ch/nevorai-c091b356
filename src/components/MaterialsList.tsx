import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Image as ImageIcon, File as FileIcon, Paperclip } from "lucide-react";
import type { MaterialEntityType } from "./MaterialsManager";

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
 * Public-facing list of downloadable materials attached to a funnel,
 * step, landing page, live session, or video. Renders nothing when empty.
 */
export const MaterialsList = ({
  entityType,
  entityId,
  heading = "Resources & Materials",
  compact = false,
}: {
  entityType: MaterialEntityType;
  entityId?: string | null;
  heading?: string;
  compact?: boolean;
}) => {
  const { data: materials = [] } = useQuery({
    queryKey: ["public-materials", entityType, entityId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("content_materials")
        .select("id, title, file_url, file_name, file_size, mime_type")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!entityId,
  });

  if (!(materials as any[]).length) return null;

  return (
    <div className={compact ? "space-y-2" : "rounded-2xl border border-border bg-card p-4 space-y-3"}>
      <div className="flex items-center gap-2">
        <Paperclip size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">{heading}</h3>
      </div>
      <div className="space-y-1.5">
        {(materials as any[]).map((m) => {
          const Icon = iconFor(m.mime_type);
          return (
            <a
              key={m.id}
              href={m.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/60 transition-colors"
            >
              <Icon size={18} className="text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{m.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {m.file_name}{m.file_size ? ` · ${prettySize(m.file_size)}` : ""}
                </p>
              </div>
              <Download size={16} className="text-primary flex-shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default MaterialsList;
