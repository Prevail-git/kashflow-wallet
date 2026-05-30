import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Eye, EyeOff, Send, QrCode, Receipt, Store, AlertCircle,
  ArrowDownLeft, ArrowUpRight, Plus, FileText, Sparkles,
  TrendingUp, ShieldCheck, Copy, Wifi, CheckCircle2, CreditCard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { countQueued, listQueued, removeQueued } from "@/lib/offline-queue";
import { submitToken, topUpWallet } from "@/lib/payments.functions";
import { useOnline } from "@/hooks/useOnline";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app")({
  component: WalletHome,
});

type Tx = {
  id: string;
  amount_cents: number;
  from_user_id: string;
  to_user_id: string;
  status: string;
  note: string | null;
  created_at: string;
};

function WalletHome() {
  const { user } = useAuth();
  const online = useOnline();
  const [balance, setBalance] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [counterparties, setCounterparties] = useState<Record<string, string>>({});
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);

  const acctNumber = useMemo(() => {
    if (!user) return "•••• •••• •••• ••••";
    const hex = user.id.replace(/-/g, "").toUpperCase();
    return `${hex.slice(0, 4)}  ${hex.slice(4, 8)}  ${hex.slice(8, 12)}  ${hex.slice(12, 16)}`;
  }, [user?.id]);
  const acctLast4 = useMemo(() => {
    if (!user) return "0000";
    return user.id.replace(/-/g, "").toUpperCase().slice(12, 16);
  }, [user?.id]);

  const refresh = async () => {
    if (!user) return;
    const [{ data: wallet }, { data: profile }, { data: txData }] = await Promise.all([
      supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase
        .from("transactions")
        .select("id, amount_cents, from_user_id, to_user_id, status, note, created_at")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    setBalance(wallet?.balance_cents ?? 0);
    setDisplayName(profile?.display_name ?? "");
    setPending(await countQueued());
    const rows = (txData ?? []) as Tx[];
    setTxs(rows);

    const ids = Array.from(new Set(rows.flatMap((t) => [t.from_user_id, t.to_user_id]))).filter((id) => id !== user.id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => (map[p.id] = p.display_name || "User"));
      setCounterparties(map);
    }
  };

  useEffect(() => { void refresh(); }, [user?.id]);
  useEffect(() => { if (online && user) void syncQueue(); }, [online, user?.id]);

  const syncQueue = async () => {
    const items = await listQueued();
    if (items.length === 0) return;
    setSyncing(true);
    let success = 0, failed = 0;
    for (const item of items) {
      try {
        const res = await submitToken({ data: { token: item.token } });
        if (res.ok) { await removeQueued(item.jti); success++; }
        else if (res.error?.includes("duplicate")) { await removeQueued(item.jti); }
        else failed++;
      } catch { failed++; }
    }
    setSyncing(false);
    await refresh();
    if (success) toast.success(`${success} queued payment${success > 1 ? "s" : ""} synced`);
    if (failed) toast.error(`${failed} payment${failed > 1 ? "s" : ""} failed to sync`);
  };

  // Spending insights from recent txs
  const insights = useMemo(() => {
    if (!user) return { spent: 0, received: 0 };
    let spent = 0, received = 0;
    for (const t of txs) {
      if (t.status !== "confirmed") continue;
      if (t.from_user_id === user.id) spent += t.amount_cents;
      if (t.to_user_id === user.id) received += t.amount_cents;
    }
    return { spent, received };
  }, [txs, user?.id]);

  const monthlyBudget = 50000; // $500 demo budget
  const budgetUsed = Math.min(100, Math.round((insights.spent / monthlyBudget) * 100));

  const savingsGoal = 100000; // $1000
  const savingsProgress = Math.min(100, Math.round(((balance ?? 0) / savingsGoal) * 100));

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName || user?.email?.split("@")[0]}</h1>
        </div>
        <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/10 text-success">
          <ShieldCheck className="h-3 w-3" /> Secured
        </Badge>
      </div>

      {/* Virtual card / primary account */}
      <Card className="relative overflow-hidden border-0 bg-gradient-trust p-0 text-primary-foreground shadow-elevated">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/60">Available balance · USD</p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="num text-4xl font-semibold tracking-tight">
                  {balance === null ? "—" : hidden ? "••••••" : formatMoney(balance)}
                </span>
                <button onClick={() => setHidden((h) => !h)} className="text-primary-foreground/60 hover:text-primary-foreground">
                  {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-primary-foreground/60">
                Ledger updated {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="grid h-9 w-12 place-items-center rounded-md bg-gradient-to-br from-amber-300 to-amber-500/80">
                <div className="grid h-5 w-7 grid-cols-3 grid-rows-2 gap-[1px] rounded-[2px] bg-amber-700/30 p-[1px]">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-amber-200/80" />)}
                </div>
              </div>
              <Wifi className="h-4 w-4 rotate-90 text-primary-foreground/70" />
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between">
            <div>
              <p className="num text-base tracking-[0.18em] text-primary-foreground/85">{acctNumber}</p>
              <div className="mt-3 flex items-center gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-primary-foreground/50">Account holder</p>
                  <p className="text-sm font-medium uppercase tracking-wide">{displayName || user?.email?.split("@")[0]}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-primary-foreground/50">Member since</p>
                  <p className="text-sm font-medium">{user?.created_at ? new Date(user.created_at).getFullYear() : "—"}</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-primary-foreground/50">Card</p>
              <p className="text-sm font-semibold tracking-wider">KASHFLOW</p>
              <p className="num mt-0.5 text-xs text-primary-foreground/70">•••• {acctLast4}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick actions row */}
      <div className="grid grid-cols-4 gap-2">
        <QuickAction to="/send" icon={ArrowUpRight} label="Send" tone="primary" />
        <QuickAction to="/receive" icon={ArrowDownLeft} label="Request" tone="success" />
        <QuickAction to="/app" icon={Plus} label="Top up" tone="muted" onClick={() => setTopUpOpen(true)} />
        <QuickAction to="/history" icon={FileText} label="Statements" tone="muted" />
      </div>

      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Top up your wallet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <Input inputMode="decimal" placeholder="0.00" className="num text-2xl" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Demo top-up · max $200 per request · $500 per day</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[20, 50, 100].map((v) => (
                <Button key={v} type="button" variant="outline" size="sm" onClick={() => setTopUpAmount(String(v))}>
                  ${v}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpOpen(false)}>Cancel</Button>
            <Button
              className="bg-gradient-emerald text-accent-foreground"
              disabled={topUpBusy || !topUpAmount}
              onClick={async () => {
                const cents = Math.round(parseFloat(topUpAmount) * 100);
                if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter a valid amount");
                setTopUpBusy(true);
                try {
                  const res = await topUpWallet({ data: { amount_cents: cents } });
                  if (res.ok) {
                    toast.success(`Top-up of $${(cents / 100).toFixed(2)} confirmed`);
                    setTopUpOpen(false);
                    setTopUpAmount("");
                    await refresh();
                  } else {
                    toast.error(res.error);
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Top-up failed");
                } finally { setTopUpBusy(false); }
              }}
            >
              {topUpBusy ? "Processing…" : "Confirm top-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account number / copy */}
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Your account ID</p>
          <p className="num truncate text-sm font-medium">{user?.id ?? ""}</p>
          <p className="text-xs text-muted-foreground">Share to receive transfers</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => { if (user) { void navigator.clipboard.writeText(user.id); toast.success("Account ID copied"); } }}
        >
          <Copy className="mr-2 h-3.5 w-3.5" /> Copy
        </Button>
      </Card>

      {/* Sync banner */}
      {pending > 0 && (
        <Card className="flex items-center justify-between border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-warning-foreground/80" />
            <div className="text-sm">
              <div className="font-medium">{pending} payment{pending > 1 ? "s" : ""} waiting to settle</div>
              <div className="text-xs text-muted-foreground">{online ? "Syncing now…" : "Will sync as soon as you're online"}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!online || syncing} onClick={syncQueue}>
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </Card>
      )}

      {/* Insights grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">This period · spending</p>
              <p className="num mt-1 text-2xl font-semibold">{formatMoney(insights.spent)}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Monthly budget</span>
              <span className="num">{budgetUsed}% of {formatMoney(monthlyBudget)}</span>
            </div>
            <Progress value={budgetUsed} className="h-2" />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Savings goal</p>
              <p className="num mt-1 text-2xl font-semibold">{formatMoney(balance ?? 0)}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-success/15 text-success">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Goal: {formatMoney(savingsGoal)}</span>
              <span className="num">{savingsProgress}%</span>
            </div>
            <Progress value={savingsProgress} className="h-2" />
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">Last 5 transactions</p>
          </div>
          <Button asChild size="sm" variant="ghost"><Link to="/history">See all</Link></Button>
        </div>
        {txs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No transactions yet. Send or receive your first payment to see it here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {txs.map((t) => {
              const outgoing = t.from_user_id === user?.id;
              const other = outgoing ? t.to_user_id : t.from_user_id;
              const name = counterparties[other] || "External account";
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className={`grid h-10 w-10 place-items-center rounded-full ${outgoing ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success"}`}>
                    {outgoing ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{outgoing ? `To ${name}` : `From ${name}`}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.note || (outgoing ? "Transfer sent" : "Transfer received")} ·{" "}
                      {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`num text-sm font-semibold ${outgoing ? "text-foreground" : "text-success"}`}>
                      {outgoing ? "−" : "+"}{formatMoney(t.amount_cents)}
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.status === "confirmed" && <CheckCircle2 className="h-3 w-3 text-success" />}
                      {t.status}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Services row */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Banking services</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ServiceTile to="/history" icon={Receipt} title="Transactions" subtitle="Receipts & status" />
          <ServiceTile to="/merchant" icon={Store} title="Merchant mode" subtitle="Accept payments" />
          <ServiceTile to="/send" icon={QrCode} title="QR payments" subtitle="Scan or generate" />
          <ServiceTile to="/app" icon={CreditCard} title="Cards" subtitle="Coming soon" disabled />
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function QuickAction({
  to, icon: Icon, label, tone, onClick,
}: {
  to: string; icon: React.ComponentType<{ className?: string }>; label: string;
  tone: "primary" | "success" | "muted"; onClick?: () => void;
}) {
  const toneClass =
    tone === "primary" ? "bg-primary text-primary-foreground"
    : tone === "success" ? "bg-gradient-emerald text-accent-foreground"
    : "bg-secondary text-primary";
  const inner = (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center shadow-card transition hover:shadow-elevated">
      <div className={`grid h-11 w-11 place-items-center rounded-full ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
  if (onClick) return <button type="button" onClick={onClick} className="text-left">{inner}</button>;
  return <Link to={to as never}>{inner}</Link>;
}

function ServiceTile({
  to, icon: Icon, title, subtitle, disabled,
}: {
  to: string; icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; disabled?: boolean;
}) {
  const content = (
    <div className={`rounded-xl border border-border bg-card p-4 shadow-card transition ${disabled ? "opacity-60" : "hover:shadow-elevated"}`}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
  if (disabled) return <div>{content}</div>;
  return <Link to={to as never}>{content}</Link>;
}
