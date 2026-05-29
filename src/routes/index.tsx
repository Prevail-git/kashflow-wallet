import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Wifi, QrCode, Store, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kashflow — Pay anywhere, even offline" },
      { name: "description", content: "Offline-first peer-to-peer payments for low-connectivity markets. Signed tokens, automatic sync, merchant mode." },
      { property: "og:title", content: "Kashflow — Offline-first wallet" },
      { property: "og:description", content: "Send and receive money even when the network goes down." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-trust text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold">Kashflow</span>
          </div>
          <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-trust text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-success" />
              Works offline · Syncs when you reconnect
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
              Payments that don't stop when the signal does.
            </h1>
            <p className="mt-5 max-w-xl text-base text-primary-foreground/80 md:text-lg">
              Send and receive money over QR codes — even when one or both phones are offline.
              Every transfer is cryptographically signed, queued safely, and reconciled the moment you're back online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-emerald text-accent-foreground hover:opacity-90">
                <Link to="/auth">Open your wallet</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-primary-foreground hover:bg-white/10">
                <Link to="/auth">For merchants</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Wifi, t: "Offline-first", d: "Generate signed transfer tokens with zero connectivity. The queue holds them safely until sync." },
            { icon: QrCode, t: "QR & Bluetooth", d: "Tap, scan, or beam. Device-to-device transfers using encrypted tokens — no shared trust required." },
            { icon: Lock, t: "Replay-proof", d: "Each token has a unique ID, expiry, and ECDSA signature. The server rejects duplicates atomically." },
            { icon: Zap, t: "Instant settlement", d: "When the network returns, balances reconcile in a single atomic database transaction." },
            { icon: Store, t: "Merchant mode", d: "Small businesses accept payments, print receipts, and track daily volume — even with patchy connectivity." },
            { icon: ShieldCheck, t: "Fraud signals", d: "Device verification, transaction signing, and an admin dashboard for flagging suspicious activity." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Kashflow MVP · For low-connectivity markets
      </footer>
    </div>
  );
}
