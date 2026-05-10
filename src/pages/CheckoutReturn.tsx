import { useEffect } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

const CheckoutReturn = () => {
  useDocumentTitle("Payment complete");
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    // Webhook updates user_subscriptions; refresh queries
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["user-plan"] });
    qc.invalidateQueries({ queryKey: ["plan-config"] });
    qc.invalidateQueries({ queryKey: ["trial-status"] });
    qc.invalidateQueries({ queryKey: ["monthly-views"] });
    qc.invalidateQueries({ queryKey: ["user-daily-views-today"] });
  }, [qc]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
        {sessionId ? (
          <>
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-heading font-bold">Payment received 🎉</h1>
            <p className="text-sm text-muted-foreground">
              Your subscription is being activated. You're covered by our 7-day money-back guarantee.
            </p>
            <p className="text-[11px] text-muted-foreground/70 break-all">
              Session: {sessionId}
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/billing")}>
                View Billing
              </Button>
              <Button className="flex-1" onClick={() => navigate("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No session info found.</p>
            <Button onClick={() => navigate("/pricing")}>Back to Pricing</Button>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckoutReturn;
