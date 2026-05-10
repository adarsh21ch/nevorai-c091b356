import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Users, Search, Download, MessageCircle, Phone } from "lucide-react";

const LeadsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: funnels = [] } = useQuery({
    queryKey: ["my-funnels", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("funnels").select("id, title").eq("owner_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["all-leads", user?.id, funnels],
    queryFn: async () => {
      const funnelIds = funnels.map((f) => f.id);
      if (!funnelIds.length) return [];
      const { data } = await supabase.from("funnel_leads").select("*").in("funnel_id", funnelIds).order("submitted_at", { ascending: false });
      return data || [];
    },
    enabled: funnels.length > 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("funnel_leads").update({ status }).eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["all-leads"] }); toast.success("Updated"); },
  });

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search && !(l.name || "").toLowerCase().includes(search.toLowerCase()) && !(l.phone || "").includes(search)) return false;
    return true;
  });

  const getFunnelTitle = (funnelId: string) => funnels.find((f) => f.id === funnelId)?.title || "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold">All Leads</h1>
            <div className="page-header-accent" />
            <p className="text-sm text-muted-foreground mt-1">{leads.length} total leads across all funnels</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const csv = "Name,Phone,Email,City,Funnel,Status,Date\n" + leads.map((l) => `"${l.name || ""}","${l.phone || ""}","${l.email || ""}","${l.city || ""}","${getFunnelTitle(l.funnel_id)}","${l.status}","${l.submitted_at}"`).join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "all-leads.csv"; a.click();
            toast.success("CSV exported!");
          }}><Download size={14} /> Export CSV</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or phone..." className="pl-9 bg-muted border-border" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-muted border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="interested">Interested</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="not_interested">Not Interested</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Users size={40} className="text-muted-foreground mx-auto mb-3" />
            <h3 className="font-heading font-semibold mb-2">No leads yet</h3>
            <p className="text-sm text-muted-foreground">Share your funnel links to start capturing leads.</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Funnel</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">City</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-medium">{l.name || "—"}</td>
                      <td className="p-3">{l.phone || "—"}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{getFunnelTitle(l.funnel_id)}</td>
                      <td className="p-3 hidden lg:table-cell">{l.city || "—"}</td>
                      <td className="p-3">
                        <Select value={l.status || "new"} onValueChange={(v) => updateStatus.mutate({ id: l.id, status: v })}>
                          <SelectTrigger className="h-7 text-xs w-28 bg-muted border-border"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="interested">Interested</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="not_interested">Not Interested</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {l.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`https://wa.me/${l.phone?.replace(/\D/g, "")}`)}><MessageCircle size={14} className="text-success" /></Button>}
                          {l.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`tel:${l.phone}`)}><Phone size={14} /></Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LeadsPage;
