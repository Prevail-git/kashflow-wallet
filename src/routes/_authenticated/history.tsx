import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function HistoryPage() {
  const { user } = useAuth();
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, amount_cents, status, note, created_at, from_user_id, to_user_id")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(100);
      setTxs((data as Tx[]) ?? []);
      const ids = new Set<string>();
      (data ?? []).forEach((t) => { ids.add(t.from_user_id); ids.add(t.to_user_id); });
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", Array.from(ids));
      setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])));
    })();
  }, [user?.id]);

  if (!txs) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />;
  if (txs.length === 0) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h2 className="text-base font-medium">No transactions yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Send or receive your first payment to see it here.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-semibold">Transactions</h1>
      {txs.map((t) => {
        const incoming = t.to_user_id === user?.id;
        const other = incoming ? t.from_user_id : t.to_user_id;
        return (
          <Card key={t.id} className="flex items-center gap-3 p-4 shadow-card">
            <div className={`grid h-10 w-10 place-items-center rounded-full ${incoming ? "bg-success/15 text-success" : "bg-secondary text-primary"}`}>
              {incoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{incoming ? "From " : "To "}{names[other] ?? other.slice(0, 8)}</span>
                <span className={`num text-sm font-semibold ${incoming ? "text-success" : ""}`}>
                  {incoming ? "+" : "−"}{formatMoney(t.amount_cents)}
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
