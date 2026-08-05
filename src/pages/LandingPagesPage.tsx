import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Eye, Users, Copy, ExternalLink, MoreVertical, Pencil, Trash2, FileText, Users2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { UpgradeModal } from "@/components/UpgradeModal";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ShareWithTeamModal } from "@/components/landing-pages/ShareWithTeamModal";

const LandingPagesPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"upgrade" | "limit">("upgrade");
  const [shareTeam, setShareTeam] = useState<{ id: string; title: string } | null>(null);

  const { isFree, canCreateLandingPage, config, counts, tier, features } = usePlanLimits();
  const queryClient = useQueryClient();

  const { data: pages = [], isLoading, error, refetch } = useQuery({
    queryKey: ["landing-pages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_pages").select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    placeholderData: keepPreviousData,
    enabled: !!user?.id,
  });

  const handleCreate = () => {
    if (!features.landingPages) { setModalType("upgrade"); setModalOpen(true); return; }
    if (isFree) { setModalType("upgrade"); setModalOpen(true); return; }
    if (!canCreateLandingPage) { setModalType("limit"); setModalOpen(true); return; }
    navigate({ to: "/landing-pages/create" });
  };

  const filtered = (pages as any[]).filter((p: any) => {
    const matchesSearch = !debouncedSearch || p.title.toLowerCase().includes(debouncedSearch.toLowerCase()) || p.slug.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesFilter = filter === "all" || p.status === filter;
    return matchesSearch && matchesFilter;
  });

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/l/${slug}`);
    toast.success("Link copied!");
  };

  const deletePage = async (id: string) => {
    const { error } = await supabase.from("landing_pages").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["landing-pages"] });
      queryClient.invalidateQueries({ queryKey: ["resource-counts"] });
    }
  };

  const statusColor = (s: string) => s === "published" ? "default" : s === "archived" ? "secondary" : "outline";

  const limitBadge = !isFree && config.max_landing_pages !== -1 ? (
    <span className={`text-xs px-2 py-0.5 rounded-full ${counts.landing_pages >= config.max_landing_pages ? "bg-destructive/10 text-destructive" : counts.landing_pages >= config.max_landing_pages - 1 ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
      {counts.landing_pages}/{config.max_landing_pages}
    </span>
  ) : null;

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-heading font-bold">Landing Pages</h1>
              <div className="page-header-accent" />
              <p className="text-muted-foreground text-sm mt-1">Create registration pages for your sessions & events</p>
            </div>
            {limitBadge}
          </div>
          <Button onClick={handleCreate} className="bg-primary w-full sm:w-auto">
            <Plus size={16} className="mr-2" /> Create Landing Page
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 search-premium rounded-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search landing pages..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {authLoading || isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Card key={i} className="p-5 animate-pulse h-48" />)}
          </div>
        ) : error ? (
          <Card className="p-12 text-center">
            <FileText size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Couldn’t load landing pages</h3>
            <p className="text-muted-foreground mb-6">Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No landing pages yet</h3>
            <p className="text-muted-foreground mb-6">
              {isFree ? "Subscribe to a plan to start creating landing pages." : "Create your first landing page to collect registrations."}
            </p>
            <Button onClick={handleCreate}>
              <Plus size={16} className="mr-2" /> {isFree ? "See Plans" : "Create Landing Page"}
            </Button>
          </Card>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {filtered.map((page: any) => {
              const sections: any[] = Array.isArray(page.sections) ? page.sections : [];
              const sectionImage = sections.find((s: any) => (s?.type === "hero" || s?.type === "image") && s?.image_url)?.image_url;
              const coverImage = sectionImage || page.og_image_url || page.speaker_photo_url || null;
              const status = page.status || "draft";
              const statusCfg: Record<string, string> = {
                published: "text-success bg-success/10 border border-success/20",
                draft: "text-muted-foreground bg-muted border border-border",
                archived: "text-muted-foreground bg-muted border border-border",
              };
              
              return (
                <div key={page.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div 
                    onClick={() => navigate({ to: "/landing-pages/$id", params: { id: page.id } })}
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex-shrink-0 w-20 h-[50px] rounded-lg bg-muted overflow-hidden border border-border flex items-center justify-center">
                      {coverImage ? (
                        <img src={coverImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <FileText size={18} className="text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{page.title || "Untitled Page"}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCfg[status] || statusCfg.draft}`}>
                          {status === "published" ? "● Published" : "○ " + status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Eye size={10} />{page.total_views || 0}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Users size={10} />{page.total_registrations || 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => navigate({ to: "/landing-pages/$id/edit", params: { id: page.id } })}
                    >
                      <Pencil size={14} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical size={15} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => window.open(`/l/${page.slug}`, "_blank")}><ExternalLink size={14} className="mr-2" /> Preview</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink(page.slug)}><Copy size={14} className="mr-2" /> Copy link</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShareTeam({ id: page.id, title: page.title })}><Users2 size={14} className="mr-2" /> Share with Team</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deletePage(page.id)} className="text-destructive"><Trash2 size={14} className="mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
        resource="landing pages"
        currentCount={counts.landing_pages}
        limit={config.max_landing_pages}
        tier={tier}
      />

      {shareTeam && (
        <ShareWithTeamModal
          open={!!shareTeam}
          onOpenChange={(v) => !v && setShareTeam(null)}
          landingPageId={shareTeam.id}
          landingPageTitle={shareTeam.title}
        />
      )}
    </>
  );
  return embedded ? content : <DashboardLayout>{content}</DashboardLayout>;
};

export default LandingPagesPage;
