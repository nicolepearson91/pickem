"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanName, LOCK_MINUTES, MAX_TRIES, nameKey, pinPassword, placeholderEmail, validName, validPin } from "@/lib/pin";

type Result = { ok: true } | { ok: false; error: string };

const WRONG = "That name and PIN don't match.";

async function recordFailure(key: string) {
  const db = createAdminClient();
  const { data } = await db.from("pin_attempts").select("failures").eq("name_key", key).maybeSingle();
  const failures = (data?.failures ?? 0) + 1;
  const locked_until = failures >= MAX_TRIES ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
  await db.from("pin_attempts").upsert({ name_key: key, failures: locked_until ? 0 : failures, locked_until });
  return { failures, locked: !!locked_until };
}

export async function signInWithPin(name: string, pin: string): Promise<Result> {
  const key = nameKey(name);
  if (!key || !validPin(pin)) return { ok: false, error: WRONG };
  const db = createAdminClient();

  const { data: attempt } = await db.from("pin_attempts").select("locked_until").eq("name_key", key).maybeSingle();
  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return { ok: false, error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or ask the pool admin to reset your PIN.` };
  }

  const { data: login } = await db.from("pin_logins").select("user_id").eq("name_key", key).maybeSingle();
  const { data: u } = login ? await db.auth.admin.getUserById(login.user_id) : { data: null };
  const email = u?.user?.email;
  if (!login || !email) {
    await recordFailure(key);
    return { ok: false, error: WRONG };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pinPassword(login.user_id, pin) });
  if (error) {
    const { failures, locked } = await recordFailure(key);
    if (locked) return { ok: false, error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or ask the pool admin to reset your PIN.` };
    const left = MAX_TRIES - failures;
    return { ok: false, error: `${WRONG} ${left} ${left === 1 ? "try" : "tries"} left before a ${LOCK_MINUTES}-minute lock.` };
  }
  await db.from("pin_attempts").delete().eq("name_key", key);
  return { ok: true };
}

export async function joinWithPin(rawName: string, pin: string, code: string): Promise<Result> {
  const name = cleanName(rawName);
  const key = nameKey(name);
  if (!validName(name)) return { ok: false, error: "Use 2 to 24 letters, numbers or spaces for your name." };
  if (!validPin(pin)) return { ok: false, error: "Your PIN must be exactly 4 digits." };
  const db = createAdminClient();

  const { data: invite } = await db.from("invite").select("code").eq("id", 1).maybeSingle();
  if (!invite || invite.code.toLowerCase() !== code.trim().toLowerCase()) {
    return { ok: false, error: "That invite code didn't work. Use the link the pool admin sent you." };
  }

  // Names must be unique so sign-in knows who you are, and so the leaderboard isn't confusing.
  const [{ data: taken }, { data: sameName }] = await Promise.all([
    db.from("pin_logins").select("name_key").eq("name_key", key).maybeSingle(),
    db.from("profiles").select("id").ilike("display_name", name.replace(/[%_\\]/g, "\\$&")).limit(1),
  ]);
  if (taken || (sameName && sameName.length)) {
    return { ok: false, error: `Someone is already called "${name}". Add a last initial or a nickname.` };
  }

  const email = placeholderEmail();
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { display_name: name, pin_login: true },
  });
  if (cErr || !created.user) return { ok: false, error: "Couldn't create your account. Try again." };
  const uid = created.user.id;

  const { error: kErr } = await db.from("pin_logins").insert({ name_key: key, user_id: uid });
  if (kErr) {
    await db.auth.admin.deleteUser(uid);
    return { ok: false, error: `Someone is already called "${name}". Add a last initial or a nickname.` };
  }
  await db.auth.admin.updateUserById(uid, { password: pinPassword(uid, pin) });
  await db.from("profiles").update({ is_member: true }).eq("id", uid);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pinPassword(uid, pin) });
  if (error) return { ok: false, error: "Your account was made, but signing in failed. Try signing in with your name and PIN." };
  return { ok: true };
}

/**
 * Sends the "reset your password" email. The link carries the sign-in itself, so it works
 * even when opened on a different phone or computer from the one that asked for it.
 */
export async function sendResetEmail(email: string): Promise<Result> {
  const { createClient: plain } = await import("@supabase/supabase-js");
  const { headers } = await import("next/headers");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const sb = plain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/reset-password` });
  if (error) {
    if (/rate limit|too many|seconds/i.test(error.message)) {
      return { ok: false, error: "Too many emails were sent recently. Wait a minute, or ask the pool admin for a reset link." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
