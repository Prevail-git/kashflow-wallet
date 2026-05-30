import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Loader2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

type Tx = {
  id: string;
  amount_cents: number;
  status: "pending" | "confirmed" | "failed" | "flagged";
  note: string | null;
  created_at: string;
  from_user_id: string;
  to_user_id: string;
};

type Filter = "all" | "in" | "out" | "flagged";

function HistoryPage() {
  const { user } = useAuth();
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount_cents, status, note, created_at, from_user_id, to_user_id")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(error.message);
      setTxs((data as Tx[]) ?? []);
      const ids = new Set<string>();
      (data ?? []).forEach((t) => { ids.add(t.from_user_id); ids.add(t.to_user_id); });
      if (ids.size) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", Array.from(ids));
        setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name || "User"])));
      }
    })();
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (!txs || !user) return [];
    const ql = q.trim().toLowerCase();
    return txs.filter((t) => {
      const incoming = t.to_user_id === user.id && t.from_user_id !== user.id;
      const outgoing = t.from_user_id === user.id && t.to_user_id !== user.id;
      if (filter === "in" && !incoming) return false;
      if (filter === "out" && !outgoing) return false;
      if (filter === "flagged" && t.status !== "flagged") return false;
      if (!ql) return true;
      const other = incoming ? t.from_user_id : t.to_user_id;
      return (
        (t.note ?? "").toLowerCase().includes(ql) ||
        (names[other] ?? "").toLowerCase().includes(ql) ||
        String(Number(t.amount_cents) / 100).includes(ql)
      );
    });
  }, [txs, filter, q, names, user?.id]);

  const totals = useMemo(() => {
    if (!user) return { inc: 0, out: 0 };
    let inc = 0, out = 0;
    for (const t of filtered) {
      if (t.status !== "confirmed") continue;
      if (t.to_user_id === user.id && t.from_user_id !== user.id) inc += Number(t.amount_cents);
      if (t.from_user_id === user.id && t.to_user_id !== user.id) out += Number(t.amount_cents);
    }
    return { inc, out };
  }, [filtered, user?.id]);

  const exportCsv = () => {
    if (!user) return;
    const rows = [["Date", "Direction", "Counterparty", "Amount (USD)", "Status", "Note"]];
    for (const t of filtered) {
      const incoming = t.to_user_id === user.id;
      const other = incoming ? t.from_user_id : t.to_user_id;
      rows.push([
        new Date(t.created_at).toISOString(),
        incoming ? "in" : "out",
        names[other] ?? other,
        ((incoming ? 1 : -1) * Number(t.amount_cents) / 100).toFixed(2),
        t.status,
        (t.note ?? "").replace(/"/g, '""'),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kashflow-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Statement downloaded");
  };

  if (!txs) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">In</div>
          <div className="num text-lg font-semibold text-success">+{formatMoney(totals.inc)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Out</div>
          <div className="num text-lg font-semibold">−{formatMoney(totals.out)}</div>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search note, name, amount" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="in">In</TabsTrigger>
          <TabsTrigger value="out">Out</TabsTrigger>
          <TabsTrigger value="flagged">Flagged</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {txs.length === 0 ? "No transactions yet. Send or receive your first payment to see it here." : "No transactions match your filters."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const incoming = t.to_user_id === user?.id && t.from_user_id !== user?.id;
            const self = t.from_user_id === user?.id && t.to_user_id === user?.id;
            const other = incoming ? t.from_user_id : t.to_user_id;
            const label = self ? "Top-up" : (incoming ? `From ${names[other] ?? other.slice(0, 8)}` : `To ${names[other] ?? other.slice(0, 8)}`);
            const sign = self ? "+" : (incoming ? "+" : "−");
            return (
              <Card key={t.id} className="flex items-center gap-3 p-4 shadow-card">
                <div className={`grid h-10 w-10 place-items-center rounded-full ${incoming || self ? "bg-success/15 text-success" : "bg-secondary text-primary"}`}>
                  {incoming || self ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{label}</span>
                    <span className={`num text-sm font-semibold ${incoming || self ? "text-success" : ""}`}>
                      {sign}{formatMoney(Number(t.amount_cents))}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{t.note || new Date(t.created_at).toLocaleString()}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Tx["status"] }) {
  const map: Record<Tx["status"], { label: string; cls: string }> = {
    confirmed: { label: "Confirmed", cls: "bg-success/15 text-success border-success/30" },
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    flagged: { label: "Flagged", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  };
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}
