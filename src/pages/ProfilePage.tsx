import { useState, useEffect } from "react";
import { MetaPixelIdField } from "@/components/pixel/MetaPixelIdField";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Crown, CreditCard, FileCheck, IndianRupee,
  Bell, Settings, Download, ChevronRight, Pencil,
  Sun, Moon, HelpCircle, LogOut, Shield, Infinity as InfinityIcon, GraduationCap,
  Sparkles, Users, Target, User, Globe, SlidersHorizontal, LifeBuoy,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Link } from "@/lib/router-compat";
import { useRouter } from "@tanstack/react-router";
import { usePlan } from "@/hooks/usePlan";
import { useAdmin } from "@/hooks/useAdmin";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { sanitizeFields, normalizePhone } from "@/lib/sanitize";
import { StorageUsageCard } from "@/components/StorageUsageCard";
import { ProfilePhotoCropModal } from "@/components/ProfilePhotoCropModal";
import { WhatsAppVerification } from "@/components/profile/WhatsAppVerification";
import { LeaderConnectionCard } from "@/components/profile/LeaderConnectionCard";

/**
 * Profile page — redesigned into 4 clear tabs:
 *   1. Personal    — who you are (private): name, phone, email, address, KYC
 *   2. Public      — what prospects see: username, display name, bio, CTA, socials, pixel
 *   3. Account     — billing, payments, storage, integrations (WhatsApp, leader)
 *   4. Preferences — theme, notifications, support, admin, logout
 *
 * Each tab has ONE explicit save button scoped to its section so it's always
 * clear which button saves what. Read-only rows use the same `Row` component.
 */

type SectionKey = "personal" | "public" | "account" | "preferences";

const ProfilePage = () => {
  useDocumentTitle("Profile");
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { plan } = usePlan();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAdmin();
  const trial = useTrialStatus();
  const router = useRouter();

  const [tab, setTab] = useState<SectionKey>("personal");
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  // Prefetch likely-next routes.
  useEffect(() => {
    const paths = ["/billing", "/payments", "/pricing", "/kyc", "/notifications", "/settings", "/help", "/install"];
    const run = () => paths.forEach((p) => { try { void router.preloadRoute({ to: p as any }); } catch {} });
    const ric = (typeof window !== "undefined" ? (window as any).requestIdleCallback : null) as
      | ((cb: () => void, opts?: { timeout: number }) => number) | null;
    if (ric) ric(run, { timeout: 1500 }); else setTimeout(run, 200);
  }, [router]);

  const [personal, setPersonal] = useState({
    full_name: "", phone: "", city: "", address: "", company: "", email: "",
  });
  const [publicForm, setPublicForm] = useState({
    display_name: "", username: "", bio: "", instagram_url: "",
    cta_label: "", cta_url: "", meta_pixel_id: "",
  });
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [cropFile, setCropFile] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    setPersonal({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      city: profile.city || "",
      address: p.address || "",
      company: profile.company || "",
      email: profile.email || "",
    });
    setPublicForm({
      display_name: p.display_name || "",
      username: p.username || "",
      bio: profile.bio || "",
      instagram_url: profile.instagram_url || "",
      cta_label: p.cta_label || "",
      cta_url: p.cta_url || "",
      meta_pixel_id: p.meta_pixel_id || "",
    });
    setAvatarUrl(profile.avatar_url || null);
  }, [profile]);

  // Username uniqueness check (debounced)
  useEffect(() => {
    const u = publicForm.username.trim().toLowerCase();
    if (!u) { setUsernameStatus("idle"); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setUsernameStatus("invalid"); return; }
    if ((profile as any)?.username === u) { setUsernameStatus("available"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("profiles").select("id").eq("username", u).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
  }, [publicForm.username, profile]);

  const savePersonal = async () => {
    if (!user) return;
    const clean = sanitizeFields(personal, ["full_name", "city", "address", "company"]) as any;
    clean.phone = normalizePhone(personal.phone);
    delete clean.email; // email uses the separate confirm-link flow
    setSavingPersonal(true);
    const { error } = await (supabase as any).from("profiles").update(clean).eq("id", user.id);
    setSavingPersonal(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    await refreshProfile();
    toast.success("Personal details updated");
  };

  const savePublic = async () => {
    if (!user) return;
    if (publicForm.username && usernameStatus !== "available") {
      toast.error("Fix username before saving"); return;
    }
    if (publicForm.cta_url && !/^https?:\/\/|^mailto:|^tel:|^wa\.me/i.test(publicForm.cta_url)) {
      toast.error("CTA URL must start with https://, mailto:, tel: or wa.me"); return;
    }
    const clean = sanitizeFields(publicForm, ["display_name", "bio", "instagram_url", "cta_label"]) as any;
    clean.username = publicForm.username.trim().toLowerCase() || null;
    clean.cta_url = publicForm.cta_url.trim() || null;
    clean.cta_label = (clean.cta_label || "").slice(0, 30) || null;
    clean.meta_pixel_id = publicForm.meta_pixel_id.replace(/\D/g, "").slice(0, 20) || null;
    setSavingPublic(true);
    const { error } = await (supabase as any).from("profiles").update(clean).eq("id", user.id);
    setSavingPublic(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    await refreshProfile();
    toast.success("Public profile updated");
  };

  const handleEmailChange = async () => {
    const newEmail = personal.email.trim().toLowerCase();
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("Enter a valid email"); return;
    }
    if (newEmail === (profile?.email || "").toLowerCase()) {
      toast.info("That's your current email."); return;
    }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailSaving(false);
    if (error) { toast.error(error.message || "Could not update email"); return; }
    toast.success("Check both inboxes — we sent a confirmation link.");
  };

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast.error("Use JPG, PNG or WebP"); return;
    }
    if (f.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setCropFile(reader.result as string);
    reader.readAsDataURL(f);
  };

  const removePhoto = async () => {
    if (!user) return;
    if (!confirm("Remove your profile photo?")) return;
    await (supabase as any).from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setAvatarUrl(null);
    await refreshProfile();
    toast.success("Photo removed");
  };

  const initials = (profile?.full_name || "U")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const tier = plan.tier;
  const isPro = tier === "pro";
  const isBasic = tier === "basic";
  const trialDaysLeft = trial.daysRemaining ?? 0;
  const isActiveTrial =
    (tier === "trial" || trial.subscriptionStatus === "trial") &&
    !trial.isTrialExpired && trialDaysLeft > 0;
  const planLabel = isPro
    ? "Pro Plan"
    : isBasic
    ? "Basic Plan"
    : isActiveTrial
    ? `Trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
    : "Free Plan";

  // Reusable primitives
  const Row = ({
    icon: Icon, label, path, desc, danger,
  }: { icon: any; label: string; path: string; desc: string; danger?: boolean }) => (
    <Link
      to={path}
      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/60 transition-colors group border border-transparent hover:border-border"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${danger ? "bg-destructive/10" : "bg-muted"}`}>
        <Icon size={15} className={danger ? "text-destructive" : "text-foreground/70"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-destructive" : ""}`}>{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground transition-colors" />
    </Link>
  );

  const SectionCard = ({
    title, hint, children,
  }: { title: string; hint?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border bg-card">
      <div className="px-5 pt-5 pb-3 border-b border-border/60">
        <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const TabPill = ({ value, icon: Icon, label }: { value: SectionKey; icon: any; label: string }) => (
    <TabsTrigger
      value={value}
      className="flex-1 gap-2 data-[state=active]:bg-foreground data-[state=active]:text-background rounded-lg"
    >
      <Icon size={14} />
      <span className="text-xs font-semibold">{label}</span>
    </TabsTrigger>
  );

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        {/* HEADER */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-foreground border-2 border-foreground flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-heading font-bold text-background">{initials}</span>
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md hover:scale-105 transition-transform" title="Change photo">
                <Pencil size={12} />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-heading font-bold text-lg truncate">{profile?.full_name || "User"}</h2>
              <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5">
                <Crown size={11} className="text-primary" />
                <span className="text-[11px] font-semibold text-primary">{planLabel}</span>
                {isPro && <InfinityIcon size={12} className="text-primary" />}
              </div>
              {avatarUrl && (
                <button onClick={removePhoto} className="block mt-1.5 text-[11px] text-muted-foreground hover:text-destructive underline">
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        {cropFile && user && (
          <ProfilePhotoCropModal
            open={!!cropFile}
            onClose={() => setCropFile(null)}
            imageSrc={cropFile}
            userId={user.id}
            onSaved={(url: string) => { setAvatarUrl(url); refreshProfile(); }}
          />
        )}

        {/* MOBILE quick-nav (unchanged behaviour) */}
        <div className="lg:hidden rounded-2xl border border-border bg-card p-4">
          <h3 className="font-heading font-bold text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Quick access
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: "/nev-ai", label: "Nev AI", icon: Sparkles },
              { to: "/team", label: "My Team", icon: Users },
              { to: "/tracking", label: "Tracking", icon: Target },
              { to: "/billing", label: "Upgrade", icon: Crown },
              { to: "/payments", label: "Payments", icon: IndianRupee },
              { to: "/help", label: "Academy", icon: GraduationCap },
            ].map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium hover:border-primary/50 hover:bg-muted/40 transition-colors min-w-0"
              >
                <it.icon size={16} className="shrink-0 text-primary" />
                <span className="truncate">{it.label}</span>
                <ChevronRight size={14} className="ml-auto shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* TABS */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as SectionKey)}>
          <TabsList className="grid grid-cols-4 gap-1 bg-muted/50 p-1 rounded-xl h-auto">
            <TabPill value="personal" icon={User} label="Personal" />
            <TabPill value="public" icon={Globe} label="Public" />
            <TabPill value="account" icon={CreditCard} label="Account" />
            <TabPill value="preferences" icon={SlidersHorizontal} label="More" />
          </TabsList>

          {/* PERSONAL */}
          <TabsContent value="personal" className="mt-5 space-y-5">
            <SectionCard
              title="Personal details"
              hint="Private information — only you and Nevorai support see this."
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full Name">
                  <Input value={personal.full_name} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} />
                </Field>
                <Field label="City">
                  <Input value={personal.city} onChange={(e) => setPersonal({ ...personal, city: e.target.value })} />
                </Field>
                <Field label="Company">
                  <Input value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <Input value={personal.address} maxLength={200} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} />
                  </Field>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="hero" size="sm" onClick={savePersonal} disabled={savingPersonal}>
                  {savingPersonal ? "Saving…" : "Save personal details"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              title="Login email"
              hint="Used to sign in. Changing it sends a confirmation link to both addresses."
            >
              <Field label="Email">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={personal.email}
                    onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEmailChange}
                    disabled={emailSaving || personal.email === (profile?.email || "")}
                  >
                    {emailSaving ? "Saving…" : "Change"}
                  </Button>
                </div>
              </Field>
            </SectionCard>

            <SectionCard title="Verification" hint="KYC unlocks payouts and the verified badge.">
              <Row icon={FileCheck} label="Get Verified" path="/kyc" desc="Complete KYC for payouts" />
            </SectionCard>
          </TabsContent>

          {/* PUBLIC */}
          <TabsContent value="public" className="mt-5 space-y-5">
            <SectionCard
              title="Public profile"
              hint="What your prospects see on shared videos and funnels."
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Display Name" hint="Shown publicly on your videos.">
                  <Input
                    value={publicForm.display_name}
                    maxLength={60}
                    placeholder={personal.full_name || "Channel name"}
                    onChange={(e) => setPublicForm({ ...publicForm, display_name: e.target.value })}
                  />
                </Field>
                <Field label="Username" hint="3–20 chars, a–z, 0–9, _">
                  <Input
                    value={publicForm.username}
                    onChange={(e) =>
                      setPublicForm({ ...publicForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })
                    }
                    placeholder="yourname"
                    maxLength={20}
                  />
                  {publicForm.username && (
                    <span className={`text-[10px] ${
                      usernameStatus === "available" ? "text-success"
                      : usernameStatus === "taken" || usernameStatus === "invalid" ? "text-destructive"
                      : "text-muted-foreground"
                    }`}>
                      {usernameStatus === "checking" && "Checking…"}
                      {usernameStatus === "available" && "Available ✓"}
                      {usernameStatus === "taken" && "Taken ✗"}
                      {usernameStatus === "invalid" && "3–20 chars, a–z, 0–9, _"}
                    </span>
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Bio" hint={`${publicForm.bio.length}/160`}>
                    <Textarea
                      value={publicForm.bio}
                      onChange={(e) => setPublicForm({ ...publicForm, bio: e.target.value.slice(0, 160) })}
                      rows={2}
                      maxLength={160}
                    />
                  </Field>
                </div>
                <Field label="Instagram URL">
                  <Input
                    value={publicForm.instagram_url}
                    onChange={(e) => setPublicForm({ ...publicForm, instagram_url: e.target.value })}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Call-to-action button" hint="Shown as a button under every video preview.">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="CTA Label">
                  <Input
                    value={publicForm.cta_label}
                    maxLength={30}
                    placeholder="e.g., Book a Call"
                    onChange={(e) => setPublicForm({ ...publicForm, cta_label: e.target.value })}
                  />
                </Field>
                <Field label="CTA URL">
                  <Input
                    value={publicForm.cta_url}
                    placeholder="https://…"
                    onChange={(e) => setPublicForm({ ...publicForm, cta_url: e.target.value })}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="Tracking pixel" hint="Optional. Meta Pixel ID for all your public pages.">
              <MetaPixelIdField
                scope="account"
                value={publicForm.meta_pixel_id}
                onChange={(v) => setPublicForm({ ...publicForm, meta_pixel_id: v })}
              />
            </SectionCard>

            <div className="flex justify-end">
              <Button variant="hero" size="sm" onClick={savePublic} disabled={savingPublic}>
                {savingPublic ? "Saving…" : "Save public profile"}
              </Button>
            </div>
          </TabsContent>

          {/* ACCOUNT */}
          <TabsContent value="account" className="mt-5 space-y-5">
            <SectionCard title="Billing & plan">
              <div className="space-y-1">
                <Row icon={CreditCard} label="Billing" path="/billing" desc="Subscription, invoices, tier upgrades" />
                {!isPro && (
                  <Row icon={Crown} label="Upgrade Plan" path="/pricing" desc="Unlock everything Nevorai offers" />
                )}
                <Row icon={IndianRupee} label="Payments" path="/payments" desc="Customer payments & history" />
              </div>
            </SectionCard>

            <StorageUsageCard />
            <LeaderConnectionCard />
            <WhatsAppVerification />
          </TabsContent>

          {/* PREFERENCES + SUPPORT + ADMIN + LOGOUT */}
          <TabsContent value="preferences" className="mt-5 space-y-5">
            <SectionCard title="Appearance">
              <div className="flex items-center justify-between rounded-lg px-1 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    {theme === "dark" ? <Moon size={15} className="text-foreground/70" /> : <Sun size={15} className="text-foreground/70" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
                    <p className="text-[11px] text-muted-foreground">Switch your interface theme</p>
                  </div>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
              </div>
            </SectionCard>

            <SectionCard title="App preferences">
              <div className="space-y-1">
                <Row icon={Bell} label="Notifications" path="/notifications" desc="Alerts & updates" />
                <Row icon={Settings} label="Settings" path="/settings" desc="App preferences" />
              </div>
            </SectionCard>

            <SectionCard title="Help & learning">
              <div className="space-y-1">
                <Row icon={GraduationCap} label="Nevorai Academy" path="/help" desc="Tutorials, FAQs and contact support" />
                <Row icon={Download} label="Install App" path="/install" desc="Add to home screen" />
                <Row icon={LifeBuoy} label="Contact Support" path="/help" desc="We're here to help" />
              </div>
            </SectionCard>

            {isAdmin && (
              <SectionCard title="Admin">
                <Row icon={Shield} label="Admin Panel" path="/admin" desc="Manage users, plans, and system settings" />
              </SectionCard>
            )}

            <div className="rounded-2xl border border-border bg-card p-2">
              <button
                onClick={async () => { await signOut(); }}
                className="flex w-full items-center gap-3 px-3 py-3 rounded-lg hover:bg-destructive/10 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <LogOut size={15} className="text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">Logout</p>
                  <p className="text-[11px] text-muted-foreground">Sign out of your account</p>
                </div>
              </button>
            </div>
          </TabsContent>
        </Tabs>

        <p className="pt-4 text-center text-[11px] text-muted-foreground">
          Nevorai · v1.0 · Made with <span aria-hidden>❤️</span> in India
        </p>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
