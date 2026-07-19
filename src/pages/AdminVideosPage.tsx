import { AdminLayout } from "@/components/layout/AdminLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useRef, useMemo } from "react";

type VideoStatsRow = {
  video_id: string;
  total_views: number | null;
  unique_views: number | null;
  unique_prospects: number | null;
  last_viewed_at: string | null;
  funnel_uses: number | null;
  landing_page_uses: number | null;
  live_session_uses: number | null;
};
type UsageFilter = "all" | "used" | "unused";
type PlanFilter = "all" | "free" | "starter" | "growth" | "leader" | "enterprise";
type QuietFilter = "any" | "1" | "7" | "15" | "30";
type OwnerRow = { owner_id: string | null; owner_name: string | null; owner_email: string | null; plan_key: string | null };

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  growth: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  leader: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  enterprise: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};
import { Upload, Video, Trash2, Loader2, Link2, Share2, Pencil, Rocket, BarChart3, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Progress } from "@/components/ui/progress";
import { VideoShareModal } from "@/components/VideoShareModal";
import { VideoRenameModal } from "@/components/VideoRenameModal";
import { useNavigate } from "@/lib/router-compat";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { VIDEO_UPLOAD_ACCEPT } from "@/lib/videoFileAcceptance";

const AdminVideosPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState("");
  const [shareVideo, setShareVideo] = useState<{ id: string; title: string } | null>(null);
  const [renameVideo, setRenameVideo] = useState<{ id: string; title: string } | null>(null);
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [quietFilter, setQuietFilter] = useState<QuietFilter>("any");

  const { data: videosRaw = [], isLoading } = useQuery({
    queryKey: ["admin-all-videos"],
    queryFn: async () => {
      const { data } = await supabase.from("video_assets").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: statsMap = {} } = useQuery<Record<string, VideoStatsRow>>({
    queryKey: ["admin-all-video-stats"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("video_stats").select("*");
      const m: Record<string, VideoStatsRow> = {};
      for (const r of (data || []) as VideoStatsRow[]) m[r.video_id] = r;
      return m;
    },
    staleTime: 60_000,
  });

  // Platform-wide blended views + people per video (via unified tracking RPC).
  // Falls back silently to legacy video_stats if the RPC isn't deployed yet.
  const { data: blendedMap = {} } = useQuery<Record<string, { views: number; people: number }>>({
    queryKey: ["admin-video-blended"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_admin_video_stats");
        if (error || !data) return {};
        const m: Record<string, { views: number; people: number }> = {};
        for (const r of data as any[]) m[r.video_id] = { views: Number(r.views) || 0, people: Number(r.people) || 0 };
        return m;
      } catch { return {}; }
    },
    staleTime: 60_000,
  });

  const { data: ownersMap = {} } = useQuery<Record<string, OwnerRow>>({
    queryKey: ["admin-video-owners"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_admin_video_owners");
        if (error || !data) return {};
        const m: Record<string, OwnerRow> = {};
        for (const r of data as any[]) m[r.video_id] = {
          owner_id: r.owner_id ?? null,
          owner_name: r.owner_name ?? null,
          owner_email: r.owner_email ?? null,
          plan_key: r.plan_key ?? null,
        };
        return m;
      } catch { return {}; }
    },
    staleTime: 60_000,
  });

  const [drillVideo, setDrillVideo] = useState<{ id: string; title: string } | null>(null);
  const { data: drillSeries = [], isLoading: drillLoading } = useQuery({
    queryKey: ["admin-video-daily", drillVideo?.id],
    queryFn: async () => {
      if (!drillVideo) return [];
      const { data } = await (supabase as any).rpc("get_admin_video_daily", { p_video_id: drillVideo.id, p_days: 30 });
      return (data || []) as Array<{ date: string; views: number; people: number }>;
    },
    enabled: !!drillVideo,
  });

  const videos = useMemo(() => {
    const merged = (videosRaw as any[]).map((v) => {
      const s = statsMap[v.id];
      const totalUses = (s?.funnel_uses || 0) + (s?.landing_page_uses || 0) + (s?.live_session_uses || 0);
      return { ...v, _stats: s, _totalUses: totalUses, _owner: ownersMap[v.id] };
    });
    let out = merged;
    if (usageFilter === "used") out = out.filter((v) => v._totalUses > 0);
    else if (usageFilter === "unused") out = out.filter((v) => v._totalUses === 0);
    if (planFilter !== "all") out = out.filter((v) => (v._owner?.plan_key || "").toLowerCase() === planFilter);
    if (quietFilter !== "any") {
      const days = Number(quietFilter);
      const cutoff = Date.now() - days * 86400_000;
      out = out.filter((v) => {
        const lv = v._stats?.last_viewed_at;
        if (!lv) return true;
        return new Date(lv).getTime() < cutoff;
      });
    }
    return out;
  }, [videosRaw, statsMap, ownersMap, usageFilter, planFilter, quietFilter]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    let videoId: string | null = null;

    try {
      const { data, error } = await supabase.functions.invoke("get-r2-upload-url", {
        body: { filename: file.name, contentType: file.type || "application/octet-stream", title: title || file.name, fileSize: file.size },
      });
      if (error || !data?.uploadUrl) throw new Error(data?.error || "Failed to get upload URL");

      videoId = data.videoId;
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });

      await new Promise<void>((resolve, reject) => {
        xhr.open("PUT", data.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.onload = () => {
          if (xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.ontimeout = () => reject(new Error("Upload timed out"));
        xhr.send(file);
      });

      const { error: confirmErr } = await supabase.functions.invoke("confirm-r2-upload", {
        body: { videoId: data.videoId, fileSizeBytes: file.size },
      });
      if (confirmErr) throw new Error("Confirmation failed");

      toast.success("Video uploaded!");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["admin-all-videos"] });
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
      if (videoId) {
        try {
          await supabase.functions.invoke("confirm-r2-upload", {
            body: { videoId, failed: true, errorMessage: err.message },
          });
        } catch {}
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("video_assets").delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-videos"] });
      toast.success("Video deleted");
    },
  });

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/video/${id}`);
    toast.success("Video link copied!");
  };

  const useInFunnel = (videoId: string) => navigate(`/funnels/create?videoId=${videoId}`);

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatLastViewed = (iso: string | null | undefined) => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  const UsageBadges = ({ v }: { v: any }) => {
    const s = v._stats;
    const f = s?.funnel_uses || 0;
    const lp = s?.landing_page_uses || 0;
    const ls = s?.live_session_uses || 0;
    if (f + lp + ls === 0) return <span className="text-xs text-muted-foreground">Unused</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {f > 0 && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Funnel ×{f}</span>}
        {lp > 0 && <span className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">LP ×{lp}</span>}
        {ls > 0 && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Live ×{ls}</span>}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="w-full min-w-0 space-y-4">
        <h1 className="text-lg font-heading font-bold sm:text-2xl">Video Management</h1>

        <div className="glass-card space-y-3 p-3 sm:p-6">
          <h2 className="text-sm font-heading font-semibold sm:text-base">Upload New Video</h2>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Video title"
                className="mt-1.5 bg-muted border-border"
              />
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept={VIDEO_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <Button
              variant="hero"
              className="min-h-[44px] w-full text-sm sm:text-base"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? "Uploading..." : "Upload Video"}
            </Button>
          </div>
          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2 bg-muted [&>div]:bg-white" />
              <p className="text-center text-xs text-muted-foreground">{uploadProgress}%</p>
            </div>
          )}
        </div>

        {/* Usage filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Usage:</span>
          {(["all", "used", "unused"] as UsageFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={usageFilter === f ? "default" : "outline"}
              className="h-7 px-3 text-xs capitalize"
              onClick={() => setUsageFilter(f)}
            >
              {f}
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{videos.length} videos</span>
        </div>

        {/* Plan filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Plan:</span>
          {(["all", "free", "starter", "growth", "leader", "enterprise"] as PlanFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={planFilter === f ? "default" : "outline"}
              className="h-7 px-3 text-xs capitalize"
              onClick={() => setPlanFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Quiet filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Last viewed:</span>
          {([
            { v: "any", label: "Any time" },
            { v: "1", label: "Quiet 24h+" },
            { v: "7", label: "Quiet 7d+" },
            { v: "15", label: "Quiet 15d+" },
            { v: "30", label: "Quiet 30d+" },
          ] as { v: QuietFilter; label: string }[]).map((f) => (
            <Button
              key={f.v}
              size="sm"
              variant={quietFilter === f.v ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => setQuietFilter(f.v)}
            >
              {f.label}
            </Button>
          ))}
        </div>


        {/* Desktop table */}
        <div className="hidden glass-card overflow-hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-4 text-xs font-medium text-muted-foreground">Video</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Uploaded by</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Size</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Usage</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Views (raw)</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">People</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Last viewed</th>
                  <th className="p-4 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-4"><div className="h-4 w-40 animate-pulse rounded bg-muted" /></td>
                      <td className="p-4"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></td>
                      <td className="p-4"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></td>
                      <td className="p-4"><div className="h-4 w-12 animate-pulse rounded bg-muted" /></td>
                      <td className="p-4"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                    </tr>
                  ))
                ) : videos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Video size={18} className="text-primary" />
                      </div>
                      <p className="text-sm font-semibold">No videos yet</p>
                      <p className="text-xs text-muted-foreground">Upload your first video using the button above.</p>
                    </td>
                  </tr>
                ) : (
                  videos.map((v) => (
                    <tr key={v.id} className="border-b border-border hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded bg-muted">
                            {v.thumbnail_url ? (
                              <img src={v.thumbnail_url} className="h-full w-full rounded object-cover" />
                            ) : (
                              <Video size={14} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{v.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{v.original_filename}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === "ready" ? "bg-success/10 text-success" : v.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">{formatSize(v.file_size_bytes)}</td>
                      <td className="p-4"><UsageBadges v={v} /></td>
                      <td className="p-4 text-xs text-muted-foreground">{blendedMap[v.id]?.views ?? v._stats?.total_views ?? v.view_count ?? 0}</td>
                      <td className="p-4 text-xs text-muted-foreground">{blendedMap[v.id]?.people ?? v._stats?.unique_views ?? 0}</td>
                      <td className="p-4 text-xs text-muted-foreground">{formatLastViewed(v._stats?.last_viewed_at)}</td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDrillVideo({ id: v.id, title: v.title })} title="View daily stats"><BarChart3 size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRenameVideo({ id: v.id, title: v.title })}><Pencil size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShareVideo({ id: v.id, title: v.title })}><Share2 size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(v.id)}><Link2 size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => useInFunnel(v.id)}><Rocket size={14} /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => { if (await confirm({ title: "Delete this video?", description: "This permanently removes the video file and analytics.", confirmLabel: "Delete", destructive: true })) deleteMutation.mutate(v.id); }}><Trash2 size={14} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2.5 sm:hidden">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card h-24 p-3 animate-pulse" />)
          ) : videos.length === 0 ? (
            <div className="glass-card flex flex-col items-center p-8 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Video size={18} className="text-primary" />
              </div>
              <p className="text-sm font-semibold">No videos yet</p>
              <p className="text-xs text-muted-foreground">Upload your first video to get started.</p>
            </div>
          ) : (
            videos.map((v) => (
              <div key={v.id} className="glass-card space-y-2.5 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      <Video size={16} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span>{formatSize(v.file_size_bytes)}</span>
                      <span>·</span>
                      <span>{blendedMap[v.id]?.views ?? v._stats?.total_views ?? v.view_count ?? 0} views</span>
                      <span>·</span>
                      <span>{blendedMap[v.id]?.people ?? v._stats?.unique_views ?? 0} people</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${v.status === "ready" ? "bg-success/10 text-success" : v.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {v.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <UsageBadges v={v} />
                      <span>·</span>
                      <span>Last viewed {formatLastViewed(v._stats?.last_viewed_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5 border-t border-border pt-2.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full rounded-lg"
                    onClick={() => setRenameVideo({ id: v.id, title: v.title })}
                    title="Rename"
                    aria-label="Rename video"
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full rounded-lg"
                    onClick={() => setShareVideo({ id: v.id, title: v.title })}
                    title="Share"
                    aria-label="Share video"
                  >
                    <Share2 size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full rounded-lg"
                    onClick={() => copyLink(v.id)}
                    title="Copy Link"
                    aria-label="Copy video link"
                  >
                    <Link2 size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full rounded-lg"
                    onClick={() => useInFunnel(v.id)}
                    title="Use in Funnel"
                    aria-label="Use video in funnel"
                  >
                    <Rocket size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full rounded-lg text-destructive hover:text-destructive"
                    onClick={async () => { if (await confirm({ title: "Delete this video?", description: "This permanently removes the video file and analytics.", confirmLabel: "Delete", destructive: true })) deleteMutation.mutate(v.id); }}
                    title="Delete"
                    aria-label="Delete video"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {shareVideo && (
        <VideoShareModal
          open={!!shareVideo}
          onClose={() => setShareVideo(null)}
          videoId={shareVideo.id}
          videoTitle={shareVideo.title}
        />
      )}
      {renameVideo && (
        <VideoRenameModal
          open={!!renameVideo}
          onClose={() => setRenameVideo(null)}
          videoId={renameVideo.id}
          currentTitle={renameVideo.title}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["admin-all-videos"] })}
        />
      )}

      {drillVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDrillVideo(null)}>
          <div className="w-full max-w-3xl rounded-xl bg-card border border-border p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-heading font-semibold truncate">{drillVideo.title}</h3>
                <p className="text-xs text-muted-foreground">Platform-wide daily views &amp; people · last 30 days</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDrillVideo(null)}><X size={16} /></Button>
            </div>
            {drillLoading ? (
              <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
            ) : drillSeries.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">No views in the last 30 days.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={drillSeries.map((d) => ({ ...d, date: String(d.date).slice(5) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Views" />
                  <Line type="monotone" dataKey="people" stroke="#10B981" strokeWidth={2} dot={false} name="People" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminVideosPage;
