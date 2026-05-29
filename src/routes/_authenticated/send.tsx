import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Bluetooth, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { findUserByEmail } from "@/lib/payments.functions";
import { getOrCreateDeviceKeypair, newJti, signTxPayload, type TxPayload } from "@/lib/crypto";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/send")({
  component: SendPage,
});

function SendPage() {
  const { user } = useAuth();
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipient, setRecipient] = useState<{ id: string; display_name: string; public_key: string | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!recipientEmail) return;
    setLoading(true);
    try {
      const r = await findUserByEmail({ data: { email: recipientEmail } });
      if (!r.ok) {
        toast.error(r.error);
        setRecipient(null);
      } else {
        setRecipient(r.profile);
      }
    } finally { setLoading(false); }
  };

  const generate = async () => {
    if (!user || !recipient) return;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter a valid amount");
    const kp = await getOrCreateDeviceKeypair();
    const now = Date.now();
    const payload: TxPayload = {
      jti: newJti(),
      from: user.id,
      to: recipient.id,
      amount_cents: cents,
      note: note || undefined,
      iat: now,
      exp: now + 1000 * 60 * 30, // 30 min validity
      pk: kp.publicKeyB64,
    };
    const signed = await signTxPayload(payload, kp.privateKeyJwk);
    setToken(signed);
  };

  if (token) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setToken(null)}>
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
            Works fully offline — once the recipient is online the token settles automatically.
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
            <div className="space-y-1.5">
              <Label>Recipient email</Label>
              <div className="flex gap-2">
                <Input value={recipientEmail} onChange={(e) => { setRecipientEmail(e.target.value); setRecipient(null); }} placeholder="them@example.com" />
                <Button type="button" variant="outline" onClick={lookup} disabled={loading || !recipientEmail}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
                </Button>
              </div>
              {recipient && (
                <p className="text-xs text-success">✓ {recipient.display_name}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Lookup needs internet once to fetch the recipient's public key. After that you can send offline indefinitely.
              </p>
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
              Web Bluetooth is available in Chrome on Android/desktop, but pairing characteristics vary by device.
              The QR flow is the recommended path for the MVP — it works on every phone and produces the same
              cryptographic token a Bluetooth transfer would.
            </p>
            <Button variant="outline" disabled>Pair device (coming soon)</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
