import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { ArrowLeft, Bluetooth, Loader2, ScanLine } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { findUserByEmail, findUserById } from "@/lib/payments.functions";
import { getOrCreateDeviceKeypair, newJti, signTxPayload, type TxPayload } from "@/lib/crypto";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/send")({
  component: SendPage,
});

type Recipient = { id: string; display_name: string; public_key: string | null };

function SendPage() {
  const { user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const lookup = async () => {
    if (!recipientEmail) return;
    setLoading(true);
    try {
      const r = await findUserByEmail({ data: { email: recipientEmail } });
      if (!r.ok) { toast.error(r.error); setRecipient(null); }
      else setRecipient(r.profile);
    } finally { setLoading(false); }
  };

  // Scanner lifecycle
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    const el = document.getElementById("send-qr-reader");
    if (!el) return;
    const scanner = new Html5Qrcode("send-qr-reader");
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (text) => { void onScan(text); },
      () => {},
    ).catch((err: unknown) => {
      if (cancelled) return;
      toast.error(`Camera unavailable: ${err instanceof Error ? err.message : String(err)}`);
      scannerRef.current = null;
      setScanning(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const stopScan = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) { try { await s.stop(); } catch {} try { s.clear(); } catch {} }
  };

  const onScan = async (raw: string) => {
    if (!raw.startsWith("kashflow:")) {
      toast.error("Not a Kashflow payment request");
      return;
    }
    await stopScan();
    setScanning(false);
    try {
      const json = JSON.parse(atob(raw.slice("kashflow:".length)));
      if (json.k !== "req" || !json.to || !json.amount_cents) throw new Error("bad payload");
      setRecipient({ id: json.to, display_name: json.name || "Merchant", public_key: json.pk });
      setRecipientEmail(json.name || "");
      setAmount((Number(json.amount_cents) / 100).toFixed(2));
      if (json.note) setNote(String(json.note));
      // Best-effort confirmation that user exists (optional, falls back to scanned data)
      void findUserById({ data: { user_id: json.to } }).then((r) => {
        if (r.ok) setRecipient(r.profile);
      }).catch(() => {});
      toast.success(`Request from ${json.name} loaded`);
    } catch {
      toast.error("Invalid request QR");
    }
  };

  const generate = async () => {
    if (!user || !recipient) return;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter a valid amount");
    if (recipient.id === user.id) return toast.error("You can't pay yourself");
    const kp = await getOrCreateDeviceKeypair();
    const now = Date.now();
    const payload: TxPayload = {
      jti: newJti(),
      from: user.id,
      to: recipient.id,
      amount_cents: cents,
      note: note || undefined,
      iat: now,
      exp: now + 1000 * 60 * 30,
      pk: kp.publicKeyB64,
    };
    const signed = await signTxPayload(payload, kp.privateKeyJwk);
    setToken(signed);
  };

  if (token) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <Button variant="ghost" size="sm" onClick={() => { setToken(null); setAmount(""); setNote(""); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> New transfer
        </Button>
        <Card className="space-y-4 p-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Send</p>
            <div className="num text-3xl font-semibold">${parseFloat(amount).toFixed(2)}</div>
            <p className="text-sm text-muted-foreground">to {recipient?.display_name}</p>
          </div>
          <div className="mx-auto rounded-xl bg-white p-4">
            <QRCodeSVG value={token} size={260} level="M" includeMargin={false} />
          </div>
          <p className="text-xs text-muted-foreground">
            Recipient scans this QR code from their <strong>Receive</strong> screen. Valid for 30 minutes.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Send a payment</h1>

      <Tabs defaultValue="qr">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="qr">QR code</TabsTrigger>
          <TabsTrigger value="bt">Bluetooth</TabsTrigger>
        </TabsList>

        <TabsContent value="qr" className="mt-4 space-y-4">
          <Card className="space-y-4 p-5">
            <Button variant="outline" className="w-full" onClick={() => setScanning((s) => !s)}>
              <ScanLine className="mr-2 h-4 w-4" />
              {scanning ? "Stop scanning" : "Scan request QR"}
            </Button>
            {scanning && (
              <div id="send-qr-reader" className="overflow-hidden rounded-lg border border-border" />
            )}

            <div className="space-y-1.5">
              <Label>Recipient email</Label>
              <div className="flex gap-2">
                <Input value={recipientEmail} onChange={(e) => { setRecipientEmail(e.target.value); setRecipient(null); }} placeholder="them@example.com" />
                <Button type="button" variant="outline" onClick={lookup} disabled={loading || !recipientEmail}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
                </Button>
              </div>
              {recipient && <p className="text-xs text-success">✓ {recipient.display_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <Input inputMode="decimal" placeholder="0.00" className="num text-2xl" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} maxLength={140} placeholder="Lunch, fare, etc." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button className="w-full bg-gradient-emerald text-accent-foreground" disabled={!recipient || !amount} onClick={generate}>
              Generate signed QR
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="bt" className="mt-4">
          <Card className="space-y-3 p-5 text-center">
            <Bluetooth className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="font-medium">Bluetooth pairing</h3>
            <p className="text-sm text-muted-foreground">
              Web Bluetooth pairing characteristics vary by device. The QR flow is the recommended path —
              it works on every phone and produces the same cryptographic token a Bluetooth transfer would.
            </p>
            <Button variant="outline" disabled>Pair device (coming soon)</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
