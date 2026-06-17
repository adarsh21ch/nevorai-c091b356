import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ClipboardPaste, Camera, Upload, AlertCircle } from "lucide-react";
import jsQR from "jsqr";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected: (leaderName: string) => void;
};

// Accept raw token, full URL like nevorai.com/join/ABCD, or ?connect=ABCD/?t=ABCD
function parseConnectCode(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  // Try URL parse first
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    // /join/<token> or /connect/<token>
    const m = u.pathname.match(/\/(?:join|connect)\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    const q = u.searchParams.get("connect") || u.searchParams.get("t") || u.searchParams.get("token");
    if (q) return q;
  } catch {}
  // Raw token
  const tok = s.match(/^[A-Za-z0-9_-]+$/);
  return tok ? s : null;
}

function sourceForTab(tab: "paste" | "scan" | "upload") {
  if (tab === "scan" || tab === "upload") return "qr";
  return "connect_link";
}

export function ConnectLeaderModal({ open, onOpenChange, onConnected }: Props) {
  const [tab, setTab] = useState<"paste" | "scan" | "upload">("paste");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const scannerRef = useRef<any>(null);
  const scannerDivId = "nev-qr-scanner-region";

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setPasted("");
      setErr("");
      setTab("paste");
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Start / stop camera scanner on tab change
  useEffect(() => {
    if (!open) return;
    if (tab === "scan") {
      void startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open]);

  const stopScanner = () => {
    const s = scannerRef.current;
    if (s) {
      try { s.stop().then(() => s.clear()).catch(() => {}); } catch {}
      scannerRef.current = null;
    }
  };

  const startScanner = async () => {
    setErr("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const instance = new Html5Qrcode(scannerDivId, { verbose: false } as any);
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded: string) => {
          stopScanner();
          await handleConnect(decoded);
        },
        () => {},
      );
    } catch (e: any) {
      setErr(
        e?.message?.toLowerCase().includes("permission")
          ? "Please allow camera access, or use Upload QR instead."
          : "Could not start camera. Try Upload QR instead.",
      );
    }
  };

  const handleConnect = async (raw: string) => {
    const code = parseConnectCode(raw);
    if (!code) {
      setErr("That doesn't look like a valid connect link or code.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("connect_to_upline", {
        p_token: code,
        p_source: sourceForTab(tab),
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("invalid")) setErr("This code is invalid or expired.");
        else if (msg.includes("self") || msg.includes("yourself"))
          setErr("You can't use your own connect link.");
        else setErr(error.message || "Connection failed. Please try again.");
        return;
      }
      // Look up leader name for toast
      let leaderName = "your leader";
      try {
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("full_name, email")
          .eq("connect_token", code)
          .maybeSingle();
        leaderName = prof?.full_name || prof?.email || leaderName;
      } catch {}
      toast.success(`Connected to ${leaderName}!`);
      onConnected(leaderName);
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || "Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    setErr("");
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const decoded = jsQR(imgData.data, imgData.width, imgData.height);
      if (!decoded?.data) {
        setErr("Could not read QR code from this image. Try a clearer photo.");
        setBusy(false);
        return;
      }
      await handleConnect(decoded.data);
    } catch {
      setErr("Could not read QR code from this image. Try a clearer photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with your leader</DialogTitle>
          <DialogDescription>
            Paste their link, scan their QR with your camera, or upload a QR image
            they sent you.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="paste"><ClipboardPaste className="h-4 w-4 mr-1" />Paste</TabsTrigger>
            <TabsTrigger value="scan"><Camera className="h-4 w-4 mr-1" />Scan</TabsTrigger>
            <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3 pt-3">
            <Input
              placeholder="Paste link or code (e.g. ABCD1234)"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              autoFocus
            />
            <Button
              className="w-full"
              disabled={busy || !pasted.trim()}
              onClick={() => handleConnect(pasted)}
            >
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Connect
            </Button>
          </TabsContent>

          <TabsContent value="scan" className="space-y-3 pt-3">
            <div
              id={scannerDivId}
              className="w-full aspect-square bg-muted rounded-lg overflow-hidden"
            />
            <p className="text-xs text-muted-foreground text-center">
              Point your camera at your leader's QR code.
            </p>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 pt-3">
            <label
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">Choose QR image</span>
              <span className="text-xs text-muted-foreground">PNG, JPG, WebP</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleUpload(f);
                }}
              />
            </label>
            {busy && (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading QR…
              </p>
            )}
          </TabsContent>
        </Tabs>

        {err && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
