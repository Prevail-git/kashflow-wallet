import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: ReturnType<typeof supabaseAdmin.from> extends never ? never : typeof supabaseAdmin, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

// Server-validated admin check used to gate the /admin route loader.
// Returns boolean instead of throwing so the loader can redirect cleanly.
export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: Boolean(data) };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(supabaseAdmin, context.userId);
    const [{ count: userCount }, { count: txCount }, { count: flaggedCount }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("fraud_flags").select("*", { count: "exact", head: true }).eq("resolved", false),
    ]);
    const { data: recent } = await supabaseAdmin
      .from("transactions")
      .select("id, amount_cents, status, created_at, from_user_id, to_user_id, note")
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, is_merchant, is_suspended, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      stats: { userCount: userCount ?? 0, txCount: txCount ?? 0, flaggedCount: flaggedCount ?? 0 },
      recent: recent ?? [],
      users: users ?? [],
    };
  });

export const flagTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ transaction_id: z.string().uuid(), reason: z.string().min(2).max(280) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(supabaseAdmin, context.userId);
    await supabaseAdmin.from("transactions").update({ status: "flagged" }).eq("id", data.transaction_id);
    const { error } = await supabaseAdmin.from("fraud_flags").insert({
      transaction_id: data.transaction_id,
      reason: data.reason,
      flagged_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid(), suspended: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(supabaseAdmin, context.userId);
    const { error } = await supabaseAdmin.from("profiles").update({ is_suspended: data.suspended }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(supabaseAdmin, context.userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: "admin" });
    return { ok: true };
  });
