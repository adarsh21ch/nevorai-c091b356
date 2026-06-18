import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Copy, QrCode, Link as LinkIcon, Users, Share2, Search, Download,
  RefreshCw, MoreHorizontal, ChevronRight, ChevronDown, ExternalLink,
} from "lucide-react";
import { brand as BRAND } from "@/config/brand";

const SITE_ORIGIN =
  (typeof window !== "undefined" && window.location.origin) || `https://${BRAND.domain}`;

const buildFunnelLink = (slug: string, token: string) =>
  `${SITE_ORIGIN}/f/${slug}?t=${token}`;

type TeamMember = {
  member_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  connected_at: string;
  source: string | null;
};

type MemberLinkRow = {
  member_id: string;
  funnel_id: string;
  funnel_title: string;
  funnel_slug: string;
  share_token: string | null;
  link_active: boolean | null;
};

type TrackingRow = {
  member_id: string;
  member_name: string | null;
  funnel_id: string;
  funnel_title: string;
  unique_views?: number | string;
  leads?: number | string;
};

function sourceBadge(src: string | null): string {
  switch (src) {
    case "qr_scan": return "QR";
    case "upload_qr": return "Upload";
    case "paste_link":
    case "connect_link": return "Link";
    default: return src || "—";
  }
}

export default function MyTeamPage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [expandedShareId, setExpandedShareId] = useState<string | null>(null);

  const connectLink = useMemo(() => {
    const token = (profile as any)?.connect_token;
    return token ? `${SITE_ORIGIN}/join/${token}` : "";
  }, [profile]);

  useEffect(() => {
    if (!connectLink) return;
    QRCode.toDataURL(connectLink, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [connectLink]);

  // Members via RPC
  const teamQuery = useQuery<TeamMember[]>({
    queryKey: ["my-team-members", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_team_members");
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });

  // All member links (for the per-member "Share Links" dropdown)
  const linksQuery = useQuery<MemberLinkRow[]>({
    queryKey: ["team-member-links", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_member_links")
        .select("member_id, funnel_id, funnel_title, funnel_slug, share_token, link_active")
        .eq("upline_id", user!.id);
      if (error) throw error;
      return (data ?? []) as MemberLinkRow[];
    },
  });

  const members = useMemo(() => {
    const list = teamQuery.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (m) =>
        (m.full_name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q),
    );
  }, [teamQuery.data, search]);

  const copy = async (text: string, msg = "Copied") => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); }
    catch { toast.error("Could not copy"); }
  };
  const shareWa = (text: string) =>
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

  const handleRemove = async (memberId: string) => {
    const { error } = await (supabase as any).rpc("remove_team_member", {
      p_member_id: memberId,
    });
    setConfirmRemoveId(null);
    if (error) {
      toast.error(error.message || "Could not remove");
      return;
    }
    toast.success("Member removed");
    qc.invalidateQueries({ queryKey: ["my-team-members"] });
    qc.invalidateQueries({ queryKey: ["team-member-links"] });
  };

  const linksByMember = useMemo(() => {
    const map = new Map<string, MemberLinkRow[]>();
    for (const r of linksQuery.data ?? []) {
      if (!map.has(r.member_id)) map.set(r.member_id, []);
      map.get(r.member_id)!.push(r);
    }
    return map;
  }, [linksQuery.data]);

  return (
    <DashboardLayout>
      <div className="container-app py-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> My Team
            </h1>
            <p className="text-sm text-muted-foreground">
              Share your connect link. When team members join, all your funnels
              get a personal tracking link for each of them.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            teamQuery.refetch(); linksQuery.refetch();
          }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Connect link + QR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="h-4 w-4 text-primary" /> Invite someone to your team
            </CardTitle>
            <CardDescription>
              Same link forever — anyone who opens it and signs in joins your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] items-start">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={connectLink} className="font-mono text-sm" />
                <Button onClick={() => copy(connectLink, "Connect link copied")}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    shareWa(
                      `Join my team on ${BRAND.name} — you'll instantly get your personal funnel links to send to prospects.\n\n${connectLink}`,
                    )
                  }
                >
                  <Share2 className="h-4 w-4 mr-1" /> Share on WhatsApp
                </Button>
                {qrDataUrl && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = qrDataUrl;
                      a.download = "connect-qr.png";
                      a.click();
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" /> Download QR
                  </Button>
                )}
              </div>
            </div>
            {qrDataUrl ? (
              <div className="rounded-lg border bg-card p-3 flex flex-col items-center gap-2">
                <img src={qrDataUrl} alt="Connect QR" className="w-40 h-40" />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <QrCode className="h-3 w-3" /> Scan to join
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Team Members ({members.length})</TabsTrigger>
            <TabsTrigger value="tracking">Team Tracking</TabsTrigger>
          </TabsList>

          {/* MEMBERS TAB */}
          <TabsContent value="members" className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {teamQuery.isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : members.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No team members yet. Share your join link above to invite your first member.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {members.map((m) => {
                  const memberLinks = (linksByMember.get(m.member_id) ?? []).filter(
                    (l) => l.share_token,
                  );
                  const expanded = expandedShareId === m.member_id;
                  return (
                    <Card key={m.member_id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setOpenMemberId(m.member_id)}
                            className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0"
                          >
                            {m.avatar_url ? (
                              <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Users className="h-5 w-5 text-primary" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenMemberId(m.member_id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="font-medium truncate">{m.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.email}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Joined {new Date(m.connected_at).toLocaleDateString(undefined, {
                                day: "numeric", month: "short",
                              })}
                              <Badge variant="secondary" className="ml-2 text-[10px] py-0">
                                {sourceBadge(m.source)}
                              </Badge>
                            </p>
                          </button>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedShareId(expanded ? null : m.member_id)
                              }
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4 mr-1" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-1" />
                              )}
                              Share Links
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setConfirmRemoveId(m.member_id)}
                                >
                                  Remove from team
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {expanded && (
                          <div className="rounded-md bg-muted/30 border p-2 space-y-2">
                            {memberLinks.length === 0 ? (
                              <p className="text-xs text-muted-foreground p-2">
                                No active links yet.
                              </p>
                            ) : (
                              memberLinks.map((l) => {
                                const url = buildFunnelLink(l.funnel_slug, l.share_token!);
                                return (
                                  <div
                                    key={l.funnel_id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span className="flex-1 truncate font-medium">
                                      {l.funnel_title}
                                    </span>
                                    <Button
                                      size="sm" variant="ghost"
                                      onClick={() => copy(url, "Link copied")}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm" variant="ghost"
                                      onClick={() =>
                                        shareWa(
                                          `Hi ${m.full_name || ""}, here is your personal link for ${l.funnel_title}:\n${url}`,
                                        )
                                      }
                                    >
                                      <Share2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TRACKING TAB */}
          <TabsContent value="tracking">
            <TeamTrackingMatrix />
          </TabsContent>
        </Tabs>
      </div>

      <MemberDetailSheet
        memberId={openMemberId}
        onClose={() => setOpenMemberId(null)}
      />

      <AlertDialog
        open={!!confirmRemoveId}
        onOpenChange={(o) => !o && setConfirmRemoveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this team member?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose their personal share links for your funnels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmRemoveId) void handleRemove(confirmRemoveId);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Phase 2: nested team drill-down */}
    </DashboardLayout>
  );
}

/* =========================================================================
 * MEMBER DETAIL — read-only activity sheet
 * ========================================================================= */
type MemberActivity = {
  profile: { full_name: string | null; avatar_url?: string | null } | null;
  total_leads: number;
  leads_by_funnel: { funnel_id: string; title: string; leads: number }[];
} | null;

function MemberDetailSheet({
  memberId, onClose,
}: { memberId: string | null; onClose: () => void }) {
  const enabled = !!memberId;
  const { data, isLoading } = useQuery<MemberActivity>({
    queryKey: ["member-activity", memberId],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_member_activity", {
        p_member_id: memberId,
      });
      if (error) throw error;
      return (data as MemberActivity) ?? null;
    },
  });

  const sorted = useMemo(
    () => [...(data?.leads_by_funnel ?? [])].sort((a, b) => b.leads - a.leads),
    [data],
  );

  return (
    <Sheet open={enabled} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {data?.profile?.avatar_url ? (
                <img src={data.profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Users className="h-5 w-5 text-primary" />
              )}
            </div>
            <span>{data?.profile?.full_name || "Member"}</span>
          </SheetTitle>
          <SheetDescription>Read-only activity for this member.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <Card>
                <CardContent className="p-5 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Leads
                  </p>
                  <p className="text-4xl font-bold mt-1">{data?.total_leads ?? 0}</p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Leads per funnel</p>
                {sorted.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No leads yet.</p>
                ) : (
                  sorted.map((f) => (
                    <div
                      key={f.funnel_id}
                      className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                    >
                      <span className="truncate">{f.title}</span>
                      <span className="font-semibold">{f.leads}</span>
                    </div>
                  ))
                )}
              </div>
              {/* Phase 2: nested team drill-down */}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* =========================================================================
 * TEAM TRACKING — KPI + per-funnel + matrix
 * ========================================================================= */
type Range = "7d" | "30d" | "all";

function rangeFrom(r: Range): string | null {
  if (r === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - (r === "7d" ? 7 : 30));
  return d.toISOString();
}

function TeamTrackingMatrix() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("30d");
  const p_from = rangeFrom(range);

  const viewsQuery = useQuery<TrackingRow[]>({
    queryKey: ["team-views", range],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_team_view_tracking", {
        p_from, p_to: null,
      });
      if (error) throw error;
      return (data ?? []) as TrackingRow[];
    },
  });


  // Leader's "Direct" views: viewer_user_id = me, share_link_id IS NULL.
  const directQuery = useQuery<{ funnel_id: string; session_id: string | null }[]>({
    queryKey: ["team-direct-views", range, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = (supabase as any)
        .from("funnel_view_events")
        .select("funnel_id, session_id, started_at")
        .eq("viewer_user_id", user!.id)
        .is("share_link_id", null);
      if (p_from) q = q.gte("started_at", p_from);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  // Funnel meta for column headers (titles from RPC rows).
  const funnels = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of viewsQuery.data ?? []) m.set(r.funnel_id, r.funnel_title);
    for (const r of leadsQuery.data ?? []) if (!m.has(r.funnel_id)) m.set(r.funnel_id, r.funnel_title);
    return Array.from(m.entries()).map(([id, title]) => ({ id, title }));
  }, [viewsQuery.data, leadsQuery.data]);

  // Members map
  const members = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of viewsQuery.data ?? []) m.set(r.member_id, r.member_name || "—");
    for (const r of leadsQuery.data ?? []) if (!m.has(r.member_id)) m.set(r.member_id, r.member_name || "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [viewsQuery.data, leadsQuery.data]);

  // matrix lookup
  const viewsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of viewsQuery.data ?? []) {
      m.set(`${r.member_id}::${r.funnel_id}`, Number(r.unique_views ?? 0));
    }
    return m;
  }, [viewsQuery.data]);
  const leadsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of leadsQuery.data ?? []) {
      m.set(`${r.member_id}::${r.funnel_id}`, Number(r.leads ?? 0));
    }
    return m;
  }, [leadsQuery.data]);

  // Direct row per funnel — unique sessions
  const directPerFunnel = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of directQuery.data ?? []) {
      if (!e.funnel_id) continue;
      const sid = e.session_id || "";
      if (!sid) continue;
      if (!map.has(e.funnel_id)) map.set(e.funnel_id, new Set());
      map.get(e.funnel_id)!.add(sid);
    }
    const out = new Map<string, number>();
    for (const [k, v] of map) out.set(k, v.size);
    return out;
  }, [directQuery.data]);

  // Per-funnel totals (Level 2)
  const perFunnel = funnels.map((f) => {
    let views = directPerFunnel.get(f.id) ?? 0;
    let leads = 0;
    for (const m of members) {
      views += viewsMap.get(`${m.id}::${f.id}`) ?? 0;
      leads += leadsMap.get(`${m.id}::${f.id}`) ?? 0;
    }
    return { ...f, views, leads };
  });

  // KPI totals (Level 1)
  const totalViews = perFunnel.reduce((s, f) => s + f.views, 0);
  const totalLeads = perFunnel.reduce((s, f) => s + f.leads, 0);

  const exportCsv = () => {
    const header = [
      "Member",
      ...funnels.map((f) => `${f.title} (views)`),
      "Total Views",
      "Total Leads",
    ];
    const rows: (string | number)[][] = members.map((m) => {
      let totalV = 0, totalL = 0;
      const cells = funnels.map((f) => {
        const v = viewsMap.get(`${m.id}::${f.id}`) ?? 0;
        const l = leadsMap.get(`${m.id}::${f.id}`) ?? 0;
        totalV += v; totalL += l;
        return v;
      });
      return [m.name, ...cells, totalV, totalL];
    });
    // Direct row
    let directTotal = 0;
    const directCells = funnels.map((f) => {
      const v = directPerFunnel.get(f.id) ?? 0;
      directTotal += v;
      return v;
    });
    rows.push(["Direct", ...directCells, directTotal, 0]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-tracking-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(["7d", "30d", "all"] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={range === r ? "default" : "outline"}
            onClick={() => setRange(r)}
          >
            {r === "all" ? "All Time" : r === "7d" ? "7 Days" : "30 Days"}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Level 1 — KPIs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Unique Views
            </p>
            <p className="text-3xl font-bold mt-1">{totalViews}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Leads
            </p>
            <p className="text-3xl font-bold mt-1">{totalLeads}</p>
          </CardContent>
        </Card>
      </div>

      {/* Level 2 — per funnel */}
      {perFunnel.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No tracking data yet for this period.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perFunnel.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4">
                <p className="text-sm font-medium truncate">{f.title}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Views</p>
                    <p className="font-semibold">{f.views}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Leads</p>
                    <p className="font-semibold">{f.leads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Level 3 — matrix */}
      {funnels.length > 0 && (members.length > 0 || directPerFunnel.size > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Breakdown by member</CardTitle>
            <CardDescription>
              Each member's unique views per funnel. "Direct" row is your own views.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 sticky left-0 bg-card">Member</th>
                  {funnels.map((f) => (
                    <th key={f.id} className="py-2 px-2 text-center whitespace-nowrap">
                      {f.title}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-center">Total Views</th>
                  <th className="py-2 px-2 text-center">Total Leads</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  let tv = 0, tl = 0;
                  return (
                    <tr key={m.id} className="border-b">
                      <td className="py-2 pr-3 sticky left-0 bg-card font-medium whitespace-nowrap">
                        {m.name}
                      </td>
                      {funnels.map((f) => {
                        const v = viewsMap.get(`${m.id}::${f.id}`) ?? 0;
                        const l = leadsMap.get(`${m.id}::${f.id}`) ?? 0;
                        tv += v; tl += l;
                        return (
                          <td key={f.id} className="text-center px-2">
                            <div>{v}</div>
                            {l > 0 && (
                              <div className="text-[10px] text-primary">{l} lead{l > 1 ? "s" : ""}</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center px-2 font-semibold">{tv}</td>
                      <td className="text-center px-2 font-semibold">{tl}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2 pr-3 sticky left-0 bg-card font-medium">
                    Direct <Badge variant="secondary" className="ml-1 text-[10px]">You</Badge>
                  </td>
                  {funnels.map((f) => {
                    const v = directPerFunnel.get(f.id) ?? 0;
                    return (
                      <td key={f.id} className="text-center px-2">{v}</td>
                    );
                  })}
                  <td className="text-center px-2 font-semibold">
                    {Array.from(directPerFunnel.values()).reduce((s, n) => s + n, 0)}
                  </td>
                  <td className="text-center px-2 font-semibold">0</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
