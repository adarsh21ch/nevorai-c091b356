import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Users, TrendingUp, IndianRupee, Clock, Layers } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useOwnerUniquePeople, useEntityUniquePeople } from "@/hooks/useUniquePeople";
import { ViewsLabel } from "@/components/insights/ViewsLabel";

const AnalyticsPage = () => {
  const { user } = useAuth();

  const { data: funnels = [] } = useQuery({
    queryKey: ["my-funnels", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("funnels").select("*").eq("owner_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["all-leads-analytics", user?.id, funnels],
    queryFn: async () => {
      const ids = funnels.map((f) => f.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("funnel_leads").select("*").in("funnel_id", ids);
      return data || [];
    },
    enabled: funnels.length > 0,
  });

  // Views = unique people across all owner surfaces (matches Dashboard + Insights)
  const people = useOwnerUniquePeople("all");
  const totalViews = people.total;
  const convRate = totalViews > 0 ? ((leads.length / totalViews) * 100).toFixed(1) : "0";

  const statusCounts = leads.reduce((acc, l) => {
    acc[l.status || "new"] = (acc[l.status || "new"] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const COLORS = ["#2563EB", "#6366F1", "#10B981", "#F59E0B", "#EF4444"];

  const topFunnels = [...funnels].sort((a, b) => (b.total_leads || 0) - (a.total_leads || 0)).slice(0, 5)
    .map((f) => ({ name: f.title.slice(0, 20), leads: f.total_leads || 0 }));

  const kpis = [
    { icon: Eye, label: <ViewsLabel />, value: totalViews.toLocaleString("en-IN") },
    { icon: Users, label: "Total Leads", value: String(leads.length) },
    { icon: TrendingUp, label: "Conversion Rate", value: `${convRate}%` },
    { icon: Layers, label: "Active Funnels", value: String(funnels.filter((f) => f.is_published).length) },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Analytics</h1>
          <div className="page-header-accent" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-center gap-2 mb-2"><k.icon size={16} className="text-primary" /><span className="text-xs text-muted-foreground">{k.label}</span></div>
              <div className="text-2xl font-heading font-bold">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h3 className="text-sm font-heading font-semibold mb-4">Top Funnels</h3>
            {topFunnels.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topFunnels}>
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8 }} />
                  <Bar dataKey="leads" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-heading font-semibold mb-4">Lead Status Breakdown</h3>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-12">No data yet</p>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
