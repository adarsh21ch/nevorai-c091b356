import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAcceptInvitation } from "@/hooks/useTenantMembers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace-invite/$token")({
  head: () => ({ meta: [{ title: "Accept invitation" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const accept = useAcceptInvitation();
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  // Auto-accept once signed in
  useEffect(() => {
    if (loading || !user || accept.isPending || status !== "idle") return;
    accept.mutateAsync(token)
      .then(() => {
        setStatus("ok");
        toast.success("You're in! Welcome to the workspace.");
        setTimeout(() => navigate({ to: "/dashboard" }), 1000);
      })
      .catch((e) => {
        setStatus("err");
        setMessage(e?.message || "Could not accept invitation");
      });
  }, [user, loading, status, token, accept, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Workspace invitation</h1>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && !user && (
          <>
            <p className="text-sm text-muted-foreground">
              Sign in with the invited email address to accept this invitation.
            </p>
            <Button onClick={() => navigate({ to: "/auth", search: { redirect: `/workspace-invite/${token}` } as any })}>
              Sign in to accept
            </Button>
          </>
        )}

        {!loading && user && status === "idle" && (
          <p className="text-sm text-muted-foreground">Accepting…</p>
        )}
        {status === "ok" && <p className="text-sm text-emerald-600">Accepted — redirecting…</p>}
        {status === "err" && (
          <>
            <p className="text-sm text-destructive">{message}</p>
            <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Go to dashboard</Button>
          </>
        )}
      </Card>
    </div>
  );
}
