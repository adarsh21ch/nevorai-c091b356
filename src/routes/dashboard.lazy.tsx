import { createLazyFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Upload, BarChart3, Settings } from "lucide-react";
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
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const firstName = profile?.full_name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

  if (loading || !user) return null;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-1 sm:p-2">
        {/* Header Section - No Company Name, focused */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{greet}, {firstName} 👋</h1>
            <p className="text-muted-foreground text-sm">Here's what's happening today.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()}>
              <Upload size={16} className="mr-2" /> Upload
            </Button>
            <Button variant="default" size="sm" onClick={() => navigate({ to: "/funnels/create" })}>
              <Plus size={16} className="mr-2" /> Funnel
            </Button>
          </div>
        </div>

        {/* Hero KPIs */}
        <ViewsOverviewCard />

        {/* Quick Actions / Insights */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => navigate({ to: "/insights" })}>
            <BarChart3 size={20} />
            <span className="text-xs">Insights</span>
          </Button>
          <Button variant="secondary" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => navigate({ to: "/profile" })}>
            <Settings size={20} />
            <span className="text-xs">Settings</span>
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
