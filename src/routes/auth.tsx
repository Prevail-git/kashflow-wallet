import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Kashflow" },
      { name: "description", content: "Sign in with a one-time code sent to your email." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app", replace: true });
  }, [user, loading, navigate]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + "/app" },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("We sent a 6-digit code to your email");
    setStage("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
  };

  return (
    <div className="min-h-screen bg-gradient-trust">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link to="/" className="mb-8 flex items-center gap-2 text-primary-foreground">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold">Kashflow</span>
        </Link>

        <div className="rounded-2xl bg-card p-6 shadow-elevated">
          <h1 className="text-xl font-semibold">Sign in to your wallet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll email you a 6-digit code. No password.
          </p>

          {stage === "email" ? (
            <form onSubmit={sendCode} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email" type="email" autoFocus required
                  placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full bg-gradient-emerald text-accent-foreground" disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code" autoFocus required inputMode="numeric" maxLength={6}
                  placeholder="123456" className="text-center text-xl tracking-[0.5em] num"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">Sent to {email}</p>
              </div>
              <Button type="submit" className="w-full bg-gradient-emerald text-accent-foreground" disabled={busy || code.length < 6}>
                {busy ? "Verifying…" : "Verify & continue"}
              </Button>
              <button type="button" className="block w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setStage("email")}>
                Use a different email
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-primary-foreground/70">
          New here? Your wallet is created on first login with a $100 demo balance.
        </p>
      </div>
    </div>
  );
}
