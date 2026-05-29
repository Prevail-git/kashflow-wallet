import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Send, QrCode, Receipt, Store, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countQueued, listQueued, removeQueued } from "@/lib/offline-queue";
import { submitToken } from "@/lib/payments.functions";
import { useOnline } from "@/hooks/useOnline";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: WalletHome,
});

function WalletHome() {
  const { user } = useAuth();
  const online = useOnline();
  const [balance, setBalance] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    if (!user) return;
    const [{ data: wallet }, { data: profile }] = await Promise.all([
      supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    setBalance(wallet?.balance_cents ?? 0);
    setDisplayName(profile?.display_name ?? "");
    setPending(await countQueued());
  };

  useEffect(() => { void refresh(); }, [user?.id]);

  // Auto-sync queued tokens when back online
  useEffect(() => {
    if (!online || !user) return;
    void syncQueue();
  }, [online, user?.id]);

  const syncQueue = async () => {
    const items = await listQueued();
    if (items.length === 0) return;
    setSyncing(true);
    let success = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const res = await submitToken({ data: { token: item.token } });
        if (res.ok) {
          await removeQueued(item.jti);
          success++;
        } else {
          // Replay duplicates also count as resolved
          if (res.error?.includes("duplicate")) {
            await removeQueued(item.jti);
          } else {
            failed++;
          }
        }
      } catch {
        failed++;
      }
    }
    setSyncing(false);
    await refresh();
    if (success) toast.success(`${success} queued payment${success > 1 ? "s" : ""} synced`);
    if (failed) toast.error(`${failed} payment${failed > 1 ? "s" : ""} failed to sync`);
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 bg-gradient-trust p-0 text-primary-foreground shadow-elevated">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-primary-foreground/70">Balance</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="num text-4xl font-semibold">
                  {balance === null ? "—" : hidden ? "••••••" : formatMoney(balance)}
                </span>
                <button onClick={() => setHidden((h) => !h)} className="opacity-60 hover:opacity-100">
                  {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-primary-foreground/70">Hi {displayName || user?.email}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link to="/send"><Send className="mr-2 h-4 w-4" /> Send</Link>
            </Button>
            <Button asChild size="lg" className="bg-gradient-emerald text-accent-foreground hover:opacity-90">
              <Link to="/receive"><QrCode className="mr-2 h-4 w-4" /> Receive</Link>
            </Button>
          </div>
        </div>
      </Card>

      {pending > 0 && (
        <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-warning-foreground/80" />
            <div className="text-sm">
              <div className="font-medium">{pending} payment{pending > 1 ? "s" : ""} waiting to sync</div>
              <div className="text-xs text-muted-foreground">{online ? "Syncing now…" : "Will sync as soon as you're online"}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!online || syncing} onClick={syncQueue}>
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/history" className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
          <Receipt className="h-5 w-5 text-primary" />
          <div className="mt-3 text-sm font-medium">Transaction history</div>
          <div className="text-xs text-muted-foreground">Receipts & status</div>
        </Link>
        <Link to="/merchant" className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
          <Store className="h-5 w-5 text-primary" />
          <div className="mt-3 text-sm font-medium">Merchant mode</div>
          <div className="text-xs text-muted-foreground">Accept payments</div>
        </Link>
      </div>
    </div>
  );
}
