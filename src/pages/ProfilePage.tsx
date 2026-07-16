import { useState, useEffect } from "react";
import { MetaPixelIdField } from "@/components/pixel/MetaPixelIdField";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Crown, CreditCard, FileCheck, IndianRupee,
  Bell, Settings, Download, ChevronRight, Pencil,
  Sun, Moon, LogOut, Shield, Infinity as InfinityIcon, GraduationCap,
  LifeBuoy, ChevronDown, Globe, Target, Mail,
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
 * Profile — single scrollable page. No tabs.
 * Header is compact (avatar, name, plan, edit button).
 * Personal details live behind an edit dialog triggered from the header.
 * Everything else is a clean list of navigable rows.
 */

const ProfilePage = () => {
  useDocumentTitle("Profile");
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { plan } = usePlan();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAdmin();
  const trial = useTrialStatus();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [publicOpen, setPublicOpen] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

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
    delete clean.email;
    setSavingPersonal(true);
    const { error } = await (supabase as any).from("profiles").update(clean).eq("id", user.id);
    setSavingPersonal(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    await refreshProfile();
    toast.success("Personal details updated");
    setEditOpen(false);
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

  const Row = ({
    icon: Icon, label, path, hint, danger, onClick,
  }: { icon: any; label: string; path?: string; hint?: string; danger?: boolean; onClick?: () => void }) => {
    const inner = (
      <>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${danger ? "bg-destructive/10" : "bg-muted"}`}>
          <Icon size={15} className={danger ? "text-destructive" : "text-foreground/70"} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${danger ? "text-destructive" : ""}`}>{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
        </div>
        <ChevronRight size={15} className="text-muted-foreground shrink-0" />
      </>
    );
    const cls = "flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors w-full text-left";
    if (path) return <Link to={path} className={cls}>{inner}</Link>;
    return <button onClick={onClick} className={cls}>{inner}</button>;
  };

  const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const Group = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border bg-card p-1.5 space-y-0.5">{children}</div>
  );

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-4 pb-10">
        {/* HEADER — compact */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-foreground border-2 border-foreground flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-heading font-bold text-background">{initials}</span>
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer shadow-md" title="Change photo">
                <Pencil size={11} />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-heading font-bold text-base sm:text-lg truncate">{profile?.full_name || "User"}</h2>
                <button
                  onClick={() => setEditOpen(true)}
                  className="shrink-0 w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  title="Edit personal details"
                  aria-label="Edit personal details"
                >
                  <Pencil size={12} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                <Crown size={10} className="text-primary" />
                <span className="text-[10px] font-semibold text-primary">{planLabel}</span>
                {isPro && <InfinityIcon size={11} className="text-primary" />}
              </div>
              {avatarUrl && (
                <button onClick={removePhoto} className="block mt-1 text-[10px] text-muted-foreground hover:text-destructive underline">
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

        {/* BILLING & PLAN */}
        <Group>
          <Row icon={CreditCard} label="Billing" path="/billing" hint="Subscription, invoices, tier upgrades" />
          {!isPro && <Row icon={Crown} label="Upgrade plan" path="/pricing" hint="Unlock everything" />}
          <Row icon={IndianRupee} label="Payments" path="/payments" hint="Customer payments & history" />
          <Row icon={FileCheck} label="Get verified (KYC)" path="/kyc" hint="Unlock payouts & verified badge" />
        </Group>

        {/* INTEGRATIONS */}
        <StorageUsageCard />
        <LeaderConnectionCard />
        <WhatsAppVerification />

        {/* PUBLIC PROFILE (collapsed) */}
        <Collapsible open={publicOpen} onOpenChange={setPublicOpen}>
          <div className="rounded-2xl border border-border bg-card">
            <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-2.5">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Globe size={15} className="text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium">Public profile</p>
                <p className="text-[11px] text-muted-foreground truncate">What prospects see on your videos & funnels</p>
              </div>
              <ChevronDown size={15} className={`text-muted-foreground shrink-0 transition-transform ${publicOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/60">
                <div className="grid sm:grid-cols-2 gap-3 pt-4">
                  <Field label="Display name">
                    <Input value={publicForm.display_name} maxLength={60} placeholder={personal.full_name || "Channel name"}
                      onChange={(e) => setPublicForm({ ...publicForm, display_name: e.target.value })} />
                  </Field>
                  <Field label="Username" hint="3–20 chars, a–z, 0–9, _">
                    <Input value={publicForm.username} maxLength={20} placeholder="yourname"
                      onChange={(e) => setPublicForm({ ...publicForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
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
                      <Textarea value={publicForm.bio} rows={2} maxLength={160}
                        onChange={(e) => setPublicForm({ ...publicForm, bio: e.target.value.slice(0, 160) })} />
                    </Field>
                  </div>
                  <Field label="Instagram URL">
                    <Input value={publicForm.instagram_url}
                      onChange={(e) => setPublicForm({ ...publicForm, instagram_url: e.target.value })} />
                  </Field>
                  <Field label="CTA label">
                    <Input value={publicForm.cta_label} maxLength={30} placeholder="Book a Call"
                      onChange={(e) => setPublicForm({ ...publicForm, cta_label: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="CTA URL">
                      <Input value={publicForm.cta_url} placeholder="https://…"
                        onChange={(e) => setPublicForm({ ...publicForm, cta_url: e.target.value })} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Meta Pixel ID" hint="Optional. Fires on your public pages.">
                      <MetaPixelIdField
                        scope="account"
                        value={publicForm.meta_pixel_id}
                        onChange={(v) => setPublicForm({ ...publicForm, meta_pixel_id: v })}
                      />
                    </Field>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="hero" size="sm" onClick={savePublic} disabled={savingPublic}>
                    {savingPublic ? "Saving…" : "Save public profile"}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* APP */}
        <Group>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {theme === "dark" ? <Moon size={15} className="text-foreground/70" /> : <Sun size={15} className="text-foreground/70" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
              <p className="text-[11px] text-muted-foreground">Switch interface theme</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
          </div>
          <Row icon={Bell} label="Notifications" path="/notifications" hint="Alerts & updates" />
          <Row icon={Settings} label="Settings" path="/settings" hint="App preferences" />
        </Group>

        {/* MORE */}
        <Group>
          <Row icon={Target} label="Tracking" path="/tracking" hint="Pixels & analytics" />
          <Row icon={GraduationCap} label="Nevorai Academy" path="/help" hint="Tutorials & FAQs" />
          <Row icon={LifeBuoy} label="Contact support" path="/help" hint="We're here to help" />
          <Row icon={Download} label="Install app" path="/install" hint="Add to home screen" />
          {isAdmin && <Row icon={Shield} label="Admin panel" path="/admin" hint="Manage users, plans & system" />}
        </Group>

        {/* LOGOUT */}
        <Group>
          <Row icon={LogOut} label="Logout" hint="Sign out of your account" danger onClick={async () => { await signOut(); }} />
        </Group>

        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          Nevorai · v1.0 · Made with <span aria-hidden>❤️</span> in India
        </p>
      </div>

      {/* PERSONAL DETAILS DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit personal details</DialogTitle>
            <DialogDescription>Private — only you and Nevorai support see this.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name">
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
            <div className="sm:col-span-2 pt-2 border-t border-border">
              <Field label="Login email" hint="Changing it sends a confirmation link to both addresses.">
                <div className="flex gap-2">
                  <Input type="email" value={personal.email}
                    onChange={(e) => setPersonal({ ...personal, email: e.target.value })} />
                  <Button variant="outline" size="sm" onClick={handleEmailChange}
                    disabled={emailSaving || personal.email === (profile?.email || "")}>
                    <Mail size={13} className="mr-1" />
                    {emailSaving ? "…" : "Change"}
                  </Button>
                </div>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="hero" onClick={savePersonal} disabled={savingPersonal}>
              {savingPersonal ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ProfilePage;
