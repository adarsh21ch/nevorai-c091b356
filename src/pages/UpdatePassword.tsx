import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/landing/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { useCapsLock } from "@/hooks/useCapsLock";

const UpdatePassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const { capsOn, handlers } = useCapsLock();

  useEffect(() => {
    // Supabase places the recovery session in the URL hash (#access_token=...).
    // The auth client picks it up automatically. We just verify a session exists.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("This reset link is invalid or has expired.");
        setTimeout(() => navigate("/auth/reset-password"), 1500);
        return;
      }
      setReady(true);
    };
    // Small delay so Supabase has time to consume the hash on page load
    setTimeout(check, 200);
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated. You're signed in.");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg-subtle">
      <div className="absolute inset-0 animate-grid opacity-30" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block"><Logo size="lg" /></Link>
        </div>
        <div className="glass-card p-8">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="text-primary" size={24} />
          </div>
          <h2 className="text-lg font-heading font-semibold mb-2 text-center">Set a new password</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Choose a strong password (at least 8 characters).
          </p>
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">Verifying reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-muted border-border pr-10"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  {...handlers}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {capsOn && (
                <p className="text-[11px] -mt-2 flex items-center gap-1 text-amber-500">
                  <AlertTriangle size={11} /> Caps Lock is on
                </p>
              )}
              <Input
                type={show ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-muted border-border"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <Button variant="hero" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          )}
          <Link to="/auth" className="block text-center text-sm text-primary hover:underline mt-4">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;
