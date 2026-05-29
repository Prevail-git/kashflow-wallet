import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CheckCircle2, AlertTriangle, ClipboardPaste, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { decodeToken, verifyToken } from "@/lib/crypto";
import { enqueueToken } from "@/lib/offline-queue";
import { submitToken } from "@/lib/payments.functions";
import { useOnline } from "@/hooks/useOnline";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatMoney } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/receive")({
  component: ReceivePage,
});

type Decoded = ReturnType<typeof decodeToken> & { valid: boolean };

function ReceivePage() {
  const { user } = useAuth();
  const online = useOnline();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [mode, setMode] = useState<"idle" | "scanning" | "review" | "done">("idle");
  const [token, setToken] = useState<string>("");
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current?.clear();
    };
  }, []);

  const startScan = async () => {
    setMode("scanning");
    try {
      const el = document.getElementById("qr-reader");
      if (!el) return;
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => { void handleToken(text); },
        () => {},
      );
    } catch (e) {
      toast.error("Camera unavailable — paste the token below instead");
      setMode("idle");
    }
  };

  const stopScan = async () => {
    try { await scannerRef.current?.stop(); } catch {}
    scannerRef.current = null;
  };

  const handleToken = async (raw: string) => {
    await stopScan();
    try {
      const d = decodeToken(raw);
      const valid = await verifyToken(raw);
      setToken(raw);
      setDecoded({ ...d, valid });
      setMode("review");
    } catch {
      toast.error("Couldn't read that QR — try again");
      setMode("idle");
    }
  };

  const accept = async () => {
    if (!decoded || !token) return;
    setBusy(true);
    if (online) {
      const res = await submitToken({ data: { token } });
      setBusy(false);
      if (res.ok) {
        toast.success("Payment received");
        setMode("done");
      } else {
        toast.error(res.error || "Failed");
      }
    } else {
      await enqueueToken({
        jti: decoded.payload.jti,
        token,
        direction: "incoming",
        queued_at: Date.now(),
      });
      setBusy(false);
      toast.success("Queued — will settle automatically when online");
      setMode("done");
    }
  };

  if (mode === "review" && decoded) {
    const p = decoded.payload;
    const expired = p.exp < Date.now();
    const youAreRecipient = p.to === user?.id;
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setMode("idle"); setDecoded(null); setToken(""); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Card className="space-y-4 p-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Incoming payment</p>
            <div className="num mt-1 text-4xl font-semibold">{formatMoney(p.amount_cents)}</div>
            {p.note && <p className="mt-1 text-sm text-muted-foreground">"{p.note}"</p>}
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <Row k="Signature" v={decoded.valid ? <span className="text-success">Valid ECDSA ✓</span> : <span className="text-destructive">Invalid</span>} />
            <Row k="Expires" v={new Date(p.exp).toLocaleString()} />
            <Row k="Token ID" v={<span className="font-mono text-xs">{p.jti.slice(0, 12)}…</span>} />
            <Row k="Status" v={online ? <span className="text-success">Will settle now</span> : <span className="text-warning-foreground">Will queue (offline)</span>} />
          </div>

          {!decoded.valid && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mr-1 inline h-4 w-4" /> Signature failed — do not accept this payment.
            </div>
          )}
          {expired && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              This token has expired and will be rejected on settlement.
            </div>
          )}
          {!youAreRecipient && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              This token isn't addressed to your account. The server will reject it.
            </div>
          )}

          <Button className="w-full bg-gradient-emerald text-accent-foreground" disabled={!decoded.valid || expired || !youAreRecipient || busy} onClick={accept}>
            {busy ? "Processing…" : online ? "Accept payment" : "Queue payment"}
          </Button>
        </Card>
      </div>
    );
  }

  if (mode === "done") {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
        <h2 className="text-xl font-semibold">{online ? "Payment received" : "Queued for sync"}</h2>
        <p className="text-sm text-muted-foreground">{online ? "Your balance has been updated." : "It will settle automatically when you reconnect."}</p>
        <Button onClick={() => { setMode("idle"); setDecoded(null); setToken(""); setManualInput(""); }}>Receive another</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Receive a payment</h1>

      <Card className="space-y-4 p-5">
        {mode === "scanning" ? (
          <>
            <div id="qr-reader" className="overflow-hidden rounded-xl" />
            <Button variant="outline" className="w-full" onClick={() => { void stopScan(); setMode("idle"); }}>Stop</Button>
          </>
        ) : (
          <>
            <Button className="w-full bg-gradient-emerald text-accent-foreground" onClick={startScan}>
              <Camera className="mr-2 h-4 w-4" /> Scan QR code
            </Button>
            <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">or paste token</div>
            <Textarea rows={3} placeholder="Paste the token text from the sender" value={manualInput} onChange={(e) => setManualInput(e.target.value)} />
            <Button variant="outline" className="w-full" disabled={!manualInput.trim()} onClick={() => handleToken(manualInput.trim())}>
              <ClipboardPaste className="mr-2 h-4 w-4" /> Use pasted token
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
