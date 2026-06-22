import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Receipt, Flag, ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  adminOverview,
  flagTransaction,
  toggleSuspendUser,
  isCurrentUserAdmin,
} from "@/lib/admin.functions";
import { formatMoney } from "@/components/AppShell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  // Server-validated gate: prevents non-admins from reaching the page even if
  // they tamper with client-side state. The _authenticated layout already
  // ensures the user is signed in before this loader runs.
  loader: async () => {
    const { isAdmin } = await isCurrentUserAdmin();
    if (!isAdmin) throw redirect({ to: "/app", replace: true });
    return null;
  },
  component: AdminPage,
});

type Overview = Awaited<ReturnType<typeof adminOverview>>;

function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try { setData(await adminOverview()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { void load(); }, []);

  if (!data) {
    return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-trust text-primary-foreground">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Admin dashboard</h1>
            <p className="text-xs text-muted-foreground">Compliance & moderation</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={refreshing}>Refresh</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Users} label="Users" value={data.stats.userCount} />
        <Stat icon={Receipt} label="Transactions" value={data.stats.txCount} />
        <Stat icon={Flag} label="Open flags" value={data.stats.flaggedCount} />
      </div>

      <Tabs defaultValue="tx">
        <TabsList>
          <TabsTrigger value="tx">Transactions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="tx" className="mt-4 space-y-2">
          {data.recent.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <div className="num text-sm font-medium">{formatMoney(t.amount_cents)}</div>
                <div className="text-xs text-muted-foreground">
                  {t.from_user_id.slice(0, 8)}… → {t.to_user_id.slice(0, 8)}…
                  {t.note ? ` · "${t.note}"` : ""}
                </div>
              </div>
              <Badge variant="outline">{t.status}</Badge>
              <Button size="sm" variant="ghost" onClick={async () => {
                const reason = prompt("Flag reason?");
                if (!reason) return;
                try {
                  await flagTransaction({ data: { transaction_id: t.id, reason } });
                  toast.success("Flagged");
                  await load();
                } catch (e) { toast.error((e as Error).message); }
              }}>
                <Flag className="mr-1 h-4 w-4" /> Flag
              </Button>
            </Card>
          ))}
          {data.recent.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-2">
          {data.users.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <div className="text-sm font-medium">{u.display_name || u.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">
                  {u.is_merchant && <Badge variant="secondary" className="mr-1">Merchant</Badge>}
                  {u.is_suspended && <Badge variant="destructive">Suspended</Badge>}
                </div>
              </div>
              <Button size="sm" variant={u.is_suspended ? "outline" : "destructive"} onClick={async () => {
                try {
                  await toggleSuspendUser({ data: { user_id: u.id, suspended: !u.is_suspended } });
                  toast.success(u.is_suspended ? "Unsuspended" : "Suspended");
                  await load();
                } catch (e) { toast.error((e as Error).message); }
              }}>
                {u.is_suspended ? "Unsuspend" : "Suspend"}
              </Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card className="p-4">
      <Icon className="h-5 w-5 text-primary" />
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
