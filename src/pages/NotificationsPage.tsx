import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Users, IndianRupee, Check, Shield, Radio, Video, Megaphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const iconMap: Record<string, any> = {
  new_lead: Users, new_payment: IndianRupee, payment_verified: Check,
  kyc_approved: Shield, kyc_rejected: Shield, broadcast_starting: Radio,
  new_video_shared: Video, system_announcement: Megaphone,
};

const NotificationsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    placeholderData: keepPreviousData,
    enabled: !!user,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user!.id).eq("is_read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Notifications</h1>
            <div className="page-header-accent" />
            {unreadCount > 0 && <p className="text-sm text-muted-foreground mt-1">{unreadCount} unread</p>}
          </div>
          {unreadCount > 0 && <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>Mark all as read</Button>}
        </div>

        {notifications.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Bell size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = iconMap[n.type] || Bell;
              return (
                <div key={n.id} className={`glass-card p-4 flex items-start gap-3 cursor-pointer transition-all ${!n.is_read ? "border-l-2 border-l-primary" : ""}`}
                  onClick={() => !n.is_read && markRead.mutate(n.id)}>
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.is_read ? "font-medium" : ""}`}>{n.title}</p>
                    {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at!), { addSuffix: true })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;
