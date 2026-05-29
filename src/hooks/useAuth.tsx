import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateDeviceKeypair } from "@/lib/crypto";
import { registerDevice } from "@/lib/payments.functions";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Listener first to avoid race
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Register device + load role when logged in
  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const kp = await getOrCreateDeviceKeypair();
        await registerDevice({ data: { public_key: kp.publicKeyB64, device_label: navigator.userAgent.slice(0, 60) } });
      } catch (e) {
        console.warn("device register failed", e);
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    loading,
    isAdmin,
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
