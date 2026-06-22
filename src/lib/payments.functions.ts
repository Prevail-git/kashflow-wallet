import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Base64url helpers (server)
function b64uDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = Buffer.from(s, "base64");
  return new Uint8Array(bin);
}

async function verifySig(token: string): Promise<{
  ok: boolean;
  payload?: {
    jti: string;
    from: string;
    to: string;
    amount_cents: number;
    note?: string;
    iat: number;
    exp: number;
    pk: string;
  };
}> {
  const [p, s] = token.split(".");
  if (!p || !s) return { ok: false };
  const payloadBytes = b64uDecode(p);
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  const jwk = JSON.parse(new TextDecoder().decode(b64uDecode(payload.pk))) as JsonWebKey;
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    b64uDecode(s) as BufferSource,
    payloadBytes as BufferSource,
  );
  return { ok, payload };
}

const PayloadSchema = z.object({
  jti: z.string().uuid(),
  from: z.string().uuid(),
  to: z.string().uuid(),
  amount_cents: z.number().int().positive().max(100_000_00),
  note: z.string().max(140).optional(),
  iat: z.number().int(),
  exp: z.number().int(),
  pk: z.string().min(10).max(2000),
});

export const submitToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(20).max(8000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { ok, payload } = await verifySig(data.token);
    if (!ok || !payload) return { ok: false, error: "Invalid signature" };

    const parsed = PayloadSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "Bad payload shape" };
    const p = parsed.data;

    // Device pubkey must be registered for the sender (anti-spoofing)
    const { data: dev } = await supabaseAdmin
      .from("devices")
      .select("id, user_id")
      .eq("user_id", p.from)
      .eq("public_key", p.pk)
      .maybeSingle();
    if (!dev) return { ok: false, error: "Sender device not recognized" };

    // Sender / receiver must not be suspended
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, is_suspended")
      .in("id", [p.from, p.to]);
    if (profs?.some((x) => x.is_suspended)) {
      return { ok: false, error: "Account suspended" };
    }

    // The signed-in caller must be sender OR receiver
    if (userId !== p.from && userId !== p.to) {
      return { ok: false, error: "Not a participant" };
    }

    const { data: result, error } = await supabaseAdmin.rpc("settle_transaction", {
      p_token_jti: p.jti,
      p_from: p.from,
      p_to: p.to,
      p_amount: p.amount_cents,
      p_note: p.note ?? "",
      p_signed_token: data.token,
      p_signer_public_key: p.pk,
      p_device_id: dev.id,
      p_issued_at: new Date(p.iat).toISOString(),
      p_expires_at: new Date(p.exp).toISOString(),
      p_submitter: userId,
    } as never);
    if (error) return { ok: false, error: error.message };
    return result as { ok: boolean; error?: string; tx_id?: string };
  });

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      public_key: z.string().min(10).max(2000),
      device_label: z.string().min(1).max(60).default("Browser"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Upsert by (user_id, public_key)
    const { data: existing } = await supabase
      .from("devices")
      .select("id")
      .eq("user_id", userId)
      .eq("public_key", data.public_key)
      .maybeSingle();
    if (existing) {
      await supabase.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
      return { id: existing.id };
    }
    const { data: inserted, error } = await supabase
      .from("devices")
      .insert({ user_id: userId, public_key: data.public_key, device_label: data.device_label })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Mirror to profile for convenience (latest public key)
    await supabase.from("profiles").update({ public_key: data.public_key }).eq("id", userId);
    return { id: inserted.id };
  });

export const findUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data }) => {
    // Use RPC to look up by email reliably (no 200-user pagination cap).
    const { data: uid, error: rpcErr } = await supabaseAdmin.rpc(
      "find_user_id_by_email" as never,
      { p_email: data.email } as never,
    );
    if (rpcErr) return { ok: false as const, error: rpcErr.message };
    if (!uid) return { ok: false as const, error: "No user with that email" };
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, public_key, is_merchant")
      .eq("id", uid as unknown as string)
      .maybeSingle();
    if (!prof?.public_key) return { ok: false as const, error: "Recipient has no registered device yet" };
    return { ok: true as const, profile: prof };
  });

export const findUserById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, public_key, is_merchant")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!prof) return { ok: false as const, error: "Recipient not found" };
    return { ok: true as const, profile: prof };
  });

// Demo top-up — credits the caller's wallet atomically via an RPC that
// holds a row-level lock and enforces the per-day cap inside one transaction.
export const topUpWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ amount_cents: z.number().int().positive().max(200_00) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: result, error } = await supabaseAdmin.rpc("topup_wallet" as never, {
      p_user: userId,
      p_amount: data.amount_cents,
    } as never);
    if (error) return { ok: false as const, error: error.message };
    const r = result as { ok: boolean; error?: string; balance_cents?: number };
    if (!r?.ok) return { ok: false as const, error: r?.error ?? "Top-up failed" };
    return { ok: true as const };
  });
