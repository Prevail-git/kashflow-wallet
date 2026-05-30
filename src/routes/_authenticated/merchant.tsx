import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store, QrCode, TrendingUp, ArrowLeft, Receipt } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatMoney } from "@/components/AppShell";
import { getOrCreateDeviceKeypair } from "@/lib/crypto";

export const Route = createFileRoute("/_authenticated/merchant")({
  component: MerchantPage,
});

type RequestPayload = {
  k: "req";
  to: string;
  name: string;
  pk: string;
  amount_cents: number;
  note?: string;
  iat: number;
};

function MerchantPage() {
  const { user } = useAuth();
  const [isMerchant, setIsMerchant] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [stats, setStats] = useState<{ today: number; count: number }>({ today: 0, count: 0 });
  const [recent, setRecent] = useState<{ id: string; amount_cents: number; note: string | null; created_at: string }[]>([]);

  // Request-payment state
  const [reqOpen, setReqOpen] = useState(false);
  const [reqAmount, setReqAmount] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqQr, setReqQr] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data: p } = await supabase.from("profiles").select("display_name, is_merchant").eq("id", user.id).single();
    setIsMerchant(p?.is_merchant ?? false);
    setBusinessName(p?.display_name ?? "");
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data: txs } = await supabase
      .from("transactions")
      .select("id, amount_cents, note, created_at")
      .eq("to_user_id", user.id)
      .neq("from_user_id", user.id)
      .eq("status", "confirmed")
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false });
    const today = (txs ?? []).reduce((s, t) => s + Number(t.amount_cents), 0);
    setStats({ today, count: txs?.length ?? 0 });
    setRecent((txs ?? []).slice(0, 5));
  };

  useEffect(() => { void load(); }, [user?.id]);

  const toggle = async (v: boolean) => {
    if (!user) return;
    setIsMerchant(v);
    const { error } = await supabase.from("profiles").update({ is_merchant: v }).eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success(v ? "Merchant mode enabled" : "Merchant mode disabled");
  };

  const saveName = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ display_name: businessName }).eq("id", user.id);
    if (error) toast.error(error.message); else toast.success("Business name saved");
  };

  const generateRequest = async () => {
    if (!user) return;
    const cents = Math.round(parseFloat(reqAmount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter a valid amount");
    const kp = await getOrCreateDeviceKeypair();
    // Make sure profile has the pubkey so payer can sync settlement
    await supabase.from("profiles").update({ public_key: kp.publicKeyB64 }).eq("id", user.id);
    const payload: RequestPayload = {
      k: "req",
      to: user.id,
      name: businessName || user.email?.split("@")[0] || "Merchant",
      pk: kp.publicKeyB64,
      amount_cents: cents,
      note: reqNote || undefined,
      iat: Date.now(),
    };
    setReqQr("kashflow:" + btoa(JSON.stringify(payload)));
  };

  if (reqQr) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <Button variant="ghost" size="sm" onClick={() => { setReqQr(null); setReqAmount(""); setReqNote(""); void load(); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> New request
        </Button>
        <Card className="space-y-4 p-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Request</p>
            <div className="num text-3xl font-semibold">${parseFloat(reqAmount).toFixed(2)}</div>
            <p className="text-sm text-muted-foreground">{businessName || "Merchant"}</p>
          </div>
          <div className="mx-auto rounded-xl bg-white p-4">
            <QRCodeSVG value={reqQr} size={260} level="M" includeMargin={false} />
          </div>
          <p className="text-xs text-muted-foreground">
            Customer opens <strong>Send</strong> → <strong>Scan request</strong> to pay this exact amount. Works offline.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-emerald text-accent-foreground">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Merchant mode</h1>
          <p className="text-xs text-muted-foreground">Accept payments from your customers</p>
        </div>
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="merch">Enable merchant mode</Label>
            <p className="text-xs text-muted-foreground">Shown to customers in their app</p>
          </div>
          <Switch id="merch" checked={isMerchant} onCheckedChange={toggle} />
        </div>

        <div className="space-y-1.5">
          <Label>Display name</Label>
          <div className="flex gap-2">
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Mama's Café" />
            <Button variant="outline" onClick={saveName}>Save</Button>
          </div>
        </div>
      </Card>

      {isMerchant && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <TrendingUp className="h-5 w-5 text-success" />
              <div className="num mt-2 text-2xl font-semibold">{formatMoney(stats.today)}</div>
              <div className="text-xs text-muted-foreground">Today's revenue</div>
            </Card>
            <Card className="p-4">
              <Receipt className="h-5 w-5 text-primary" />
              <div className="num mt-2 text-2xl font-semibold">{stats.count}</div>
              <div className="text-xs text-muted-foreground">Today's transactions</div>
            </Card>
          </div>

          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-medium">Request a payment</h3>
            </div>
            {!reqOpen ? (
              <Button className="w-full bg-gradient-emerald text-accent-foreground" onClick={() => setReqOpen(true)}>
                Create payment request
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <Input inputMode="decimal" placeholder="0.00" className="num text-2xl" value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea rows={2} maxLength={140} placeholder="Order #123" value={reqNote} onChange={(e) => setReqNote(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setReqOpen(false)}>Cancel</Button>
                  <Button className="flex-1 bg-gradient-emerald text-accent-foreground" disabled={!reqAmount} onClick={generateRequest}>
                    Show QR
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Or use the <Link to="/receive" className="text-primary underline">Receive</Link> scanner to take a customer-initiated payment.
            </p>
          </Card>

          {recent.length > 0 && (
            <Card className="space-y-2 p-5">
              <h3 className="text-sm font-medium">Recent payments today</h3>
              {recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-t border-border pt-2 text-sm first:border-0 first:pt-0">
                  <div className="min-w-0">
                    <div className="truncate">{t.note || "Payment"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleTimeString()}</div>
                  </div>
                  <div className="num font-semibold text-success">+{formatMoney(Number(t.amount_cents))}</div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
