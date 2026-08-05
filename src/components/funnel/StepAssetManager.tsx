import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Plus, Trash2, ExternalLink, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface StepAsset {
  id: string;
  title: string;
  file_url: string;
  file_type: string;
}

interface StepAssetManagerProps {
  funnelId: string;
  stepId: string;
}

export function StepAssetManager({ funnelId, stepId }: StepAssetManagerProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["step-assets", stepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_step_assets" as any)
        .select("*")
        .eq("funnel_step_id", stepId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as any as StepAsset[];
    },

  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `funnel-assets/${funnelId}/${stepId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("funnel-content")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("funnel-content")
        .getPublicUrl(filePath);

      let fileType = "other";
      if (file.type.includes("pdf")) fileType = "pdf";
      else if (file.type.includes("image")) fileType = "image";
      else if (file.type.includes("video")) fileType = "video";

      const { error: dbError } = await (supabase.from("funnel_step_assets" as any) as any).insert({
        funnel_id: funnelId,
        funnel_step_id: stepId,
        title: file.name,
        file_url: publicUrl,
        file_type: fileType,
        file_size_bytes: file.size,
      });


      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["step-assets", stepId] });
      toast.success("Asset uploaded successfully");
      setIsUploading(false);
    },
    onError: (err) => {
      console.error(err);
      toast.error("Upload failed");
      setIsUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase.from("funnel_step_assets" as any).delete().eq("id", assetId);
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["step-assets", stepId] });
      toast.success("Asset removed");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be under 10MB");
        return;
      }
      uploadMutation.mutate(file);
    }
  };

  if (isLoading) return <div className="animate-pulse h-20 bg-muted/20 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-muted-foreground" />
          <Label className="text-sm font-medium">Attachments & Resources</Label>
        </div>
        <div className="relative">
          <input
            type="file"
            id={`asset-upload-${stepId}`}
            className="sr-only"
            onChange={handleFileChange}
            accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
            disabled={isUploading}
          />
          <Label
            htmlFor={`asset-upload-${stepId}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-primary/30 text-primary hover:bg-primary/5 transition cursor-pointer text-xs font-semibold ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add PDF/Image
          </Label>
        </div>
      </div>

      {assets.length > 0 ? (
        <div className="grid gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 group">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border border-border shrink-0">
                  {asset.file_type === "pdf" ? <FileText size={16} className="text-red-500" /> : <ImageIcon size={16} className="text-blue-500" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate max-w-[180px]">{asset.title}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{asset.file_type}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => window.open(asset.file_url, "_blank")}>
                  <ExternalLink size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(asset.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 rounded-2xl border border-dashed border-border bg-muted/10">
          <p className="text-[11px] text-muted-foreground">No resources attached yet.<br />Give your prospects PDFs or study material.</p>
        </div>
      )}
    </div>
  );
}
