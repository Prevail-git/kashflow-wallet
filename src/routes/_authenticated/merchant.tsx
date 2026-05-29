import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store, QrCode, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatMoney } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/merchant")({
  component: MerchantPage,
});

function MerchantPage() {
  const { user } = useAuth();
  const [isMerchant, setIsMerchant] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [stats, setStats] = useState<{ today: number; count: number }>({ today: 0, count: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("display_name, is_merchant").eq("id", user.id).single();
      setIsMerchant(p?.is_merchant ?? false);
      setBusinessName(p?.display_name ?? "");

      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data: txs } = await supabase
        .from("transactions")
        .select("amount_cents")
        .eq("to_user_id", user.id)
        .eq("status", "confirmed")
        .gte("created_at", start.toISOString());
      const today = (txs ?? []).reduce((s, t) => s + t.amount_cents, 0);
      setStats({ today, count: txs?.length ?? 0 });
    })();
  }, [user?.id]);

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
    if (error) toast.error(error.message); else toast.success("Saved");
  };

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
              <QrCode className="h-5 w-5 text-primary" />
              <div className="num mt-2 text-2xl font-semibold">{stats.count}</div>
              <div className="text-xs text-muted-foreground">Today's transactions</div>
            </Card>
          </div>

          <Card className="space-y-3 p-5">
            <h3 className="text-sm font-medium">Take a payment</h3>
            <p className="text-sm text-muted-foreground">
              Use <Link to="/receive" className="text-primary underline">Receive</Link> to scan a customer's payment QR.
              Works offline — the receipt syncs when you're back online.
            </p>
            <Button asChild className="w-full bg-gradient-emerald text-accent-foreground">
              <Link to="/receive">Open scanner</Link>
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
