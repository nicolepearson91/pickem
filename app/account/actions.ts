"use server";

import { revalidatePath } from "next/cache";
import { createClient as plain } from "@supabase/supabase-js";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinPassword, validPin } from "@/lib/pin";

type Result = { ok: true } | { ok: false; error: string };

/** Checks a password without touching the browser's session. */
async function passwordWorks(email: string, password: string) {
  const sb = plain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return !error;
}

export async function rename(formData: FormData): Promise<Result> {
  const { user } = await requireMember();
  const { renameUser } = await import("@/lib/rename");
  const r = await renameUser(user.id, String(formData.get("name") || ""));
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(current: string, next: string): Promise<Result> {
  const { supabase, user } = await requireMember();
  if (next.length < 6) return { ok: false, error: "Use at least 6 characters." };
  const { data: login } = await createAdminClient().from("pin_logins").select("name_key").eq("user_id", user.id).maybeSingle();
  if (login) return { ok: false, error: "You sign in with a PIN. Change your PIN instead." };
  const hasPassword = ((user.app_metadata?.providers as string[] | undefined) ?? []).includes("email");
  if (hasPassword && !(await passwordWorks(user.email!, current))) {
    return { ok: false, error: "Your current password isn't right. If you forgot it, sign out and use Forgot password." };
  }
  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, { password: next });
  if (error) return { ok: false, error: error.message };
  // Changing the password ends the old session, so sign this device straight back in.
  await supabase.auth.signInWithPassword({ email: user.email!, password: next });
  return { ok: true };
}

export async function changePin(current: string, next: string): Promise<Result> {
  const { supabase, user } = await requireMember();
  if (!validPin(next)) return { ok: false, error: "Your new PIN must be exactly 4 digits." };
  const db = createAdminClient();
  const { data: login } = await db.from("pin_logins").select("name_key").eq("user_id", user.id).maybeSingle();
  if (!login) return { ok: false, error: "You sign in with email, not a PIN." };
  if (!validPin(current) || !(await passwordWorks(user.email!, pinPassword(user.id, current)))) {
    return { ok: false, error: "Your current PIN isn't right. If you forgot it, ask the pool admin to reset it." };
  }
  const { error } = await db.auth.admin.updateUserById(user.id, { password: pinPassword(user.id, next) });
  if (error) return { ok: false, error: error.message };
  // Changing the PIN ends the old session, so sign this device straight back in.
  await supabase.auth.signInWithPassword({ email: user.email!, password: pinPassword(user.id, next) });
  return { ok: true };
}

export async function savePayoutInfo(formData: FormData): Promise<Result> {
  const { supabase, user } = await requireMember();
  const clean = (k: string) => String(formData.get(k) || "").trim().replace(/^[@$]/, "").slice(0, 40) || null;
  const { error } = await supabase.from("payout_info").upsert({
    user_id: user.id, venmo_handle: clean("venmo"), cashapp_tag: clean("cashapp"), updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: /payout_info/.test(error.message) ? "This isn't switched on yet. The pool admin needs to finish setup." : error.message };
  return { ok: true };
}
