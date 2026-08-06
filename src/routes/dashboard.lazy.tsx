import { createLazyFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Upload, BarChart3, Settings, Radio, Wrench } from "lucide-react";
import { VideoUploadModal } from "@/components/VideoUploadModal";
import { VIDEO_UPLOAD_ACCEPT } from "@/lib/videoFileAcceptance";
import { ViewsOverviewCard } from "@/components/dashboard/ViewsOverviewCard";
import { WatchingNowStrip } from "@/components/dashboard/WatchingNowStrip";
import { DashboardContentRow } from "@/components/dashboard/DashboardContentRow";

export const Route = createLazyFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  useDocumentTitle("Dashboard");
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user]);

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("dashboard_summary", { p_user_id: user!.id });
      if (error) throw error;
      return (data as any) ?? { funnels: [], total_leads: 0, active_live_session: null };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });

  const firstName = profile?.full_name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

  if (loading || !user) return null;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-1 sm:p-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold truncate">{greet}, {firstName} 👋</h1>
        </div>

        <ViewsOverviewCard />

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Button variant="secondary" className="h-auto py-3.5 flex flex-col items-center gap-2" onClick={() => navigate({ to: "/insights" })}>
            <BarChart3 size={18} className="text-primary" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-tight">Insights</span>
          </Button>
          <Button variant="secondary" className="h-auto py-3.5 flex flex-col items-center gap-2" onClick={() => navigate({ to: "/videos" })}>
            <Plus size={18} className="text-primary" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-tight">Upload</span>
          </Button>
          <Button variant="secondary" className="h-auto py-3.5 flex flex-col items-center gap-2" onClick={() => navigate({ to: "/tools" })}>
            <Wrench size={18} className="text-primary" />
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-tight">Tools</span>
          </Button>
        </div>

        <WatchingNowStrip />
        <DashboardContentRow />
        
        <input ref={uploadInputRef} type="file" accept={VIDEO_UPLOAD_ACCEPT} className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setUploadOpen(true);
        }} />
        <VideoUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={() => {}} />
      </div>
    </DashboardLayout>
  );
}
