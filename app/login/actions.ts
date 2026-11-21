"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { looksAlike, sameName } from "@/lib/similar";
import { cleanName, LOCK_MINUTES, MAX_TRIES, nameKey, pinPassword, placeholderEmail, validName, validPin } from "@/lib/pin";

type Result = { ok: true } | { ok: false; error: string };
/** similar: an existing player whose name looks like this one, so the person can say whether it's them. */
type JoinResult = { ok: true } | { ok: false; error: string; similar?: string };

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

export async function joinWithPin(rawName: string, pin: string, code: string, notThem = false): Promise<JoinResult> {
  const name = cleanName(rawName);
  const key = nameKey(name);
  if (!validName(name)) return { ok: false, error: "Use 2 to 24 letters, numbers or spaces for your name." };
  if (!validPin(pin)) return { ok: false, error: "Your PIN must be exactly 4 digits." };
  const db = createAdminClient();

  const { data: invite } = await db.from("invite").select("code").eq("id", 1).maybeSingle();
  if (!invite || invite.code.toLowerCase() !== code.trim().toLowerCase()) {
    return { ok: false, error: "That invite code didn't work. Use the link the pool admin sent you." };
  }

  const takenMsg = `Someone is already called "${name}". If that's you, tap Sign in below. If not, add your last initial, like "${name.split(" ")[0]} R".`;

  // Same name and same PIN as an existing player: this is a retry or a double tap, so just sign them in.
  const { data: existing, error: lookupErr } = await db.from("pin_logins").select("user_id").eq("name_key", key).maybeSingle();
  if (lookupErr) return { ok: false, error: `Joining isn't set up yet (${lookupErr.message}). Tell the pool admin.` };
  if (existing) return (await signInAs(existing.user_id, pin)) ? { ok: true } : { ok: false, error: takenMsg };

  // A sign-up that broke halfway can leave a name behind with no way to sign in. Clear those for this name.
  await clearUnfinishedSignups(name);

  const { data: everyone } = await db.from("profiles").select("display_name");
  const names = (everyone ?? []).map((p) => p.display_name as string);
  if (names.some((n) => sameName(n, name))) return { ok: false, error: takenMsg };
  // Catch "Mike" vs "Mike B": most likely the same person joining again on a new phone.
  const alike = names.find((n) => looksAlike(n, name));
  if (alike && !notThem) {
    return { ok: false, similar: alike, error: `"${alike}" already joined. If that's you, sign in instead so your picks stay together.` };
  }

  // Create the account with its PIN already set, so there's no half-made state if anything fails later.
  const uid = randomUUID();
  const { error: cErr } = await db.auth.admin.createUser({
    id: uid,
    email: placeholderEmail(),
    password: pinPassword(uid, pin),
    email_confirm: true,
    user_metadata: { display_name: name, pin_login: true },
  });
  if (cErr) return { ok: false, error: `Couldn't create your account: ${cErr.message}. Try again in a moment.` };

  const { error: kErr } = await db.from("pin_logins").insert({ name_key: key, user_id: uid });
  if (kErr) {
    await db.auth.admin.deleteUser(uid);
    if (kErr.code === "23505") {
      // Someone (very likely this same person, from a double tap) grabbed the name a moment ago.
      const { data: winner } = await db.from("pin_logins").select("user_id").eq("name_key", key).maybeSingle();
      if (winner && (await signInAs(winner.user_id, pin))) return { ok: true };
      return { ok: false, error: takenMsg };
    }
    return { ok: false, error: `Couldn't save your name (${kErr.message}). Tell the pool admin.` };
  }
  await db.from("profiles").update({ is_member: true }).eq("id", uid);

  if (!(await signInAs(uid, pin))) {
    return { ok: false, error: "Your account is ready. Tap Sign in below and use your name and PIN." };
  }
  return { ok: true };
}

/** Signs this browser in as a name + PIN player. Returns false if the PIN is wrong. */
async function signInAs(userId: string, pin: string) {
  const db = createAdminClient();
  const { data: u } = await db.auth.admin.getUserById(userId);
  if (!u?.user?.email) return false;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: u.user.email, password: pinPassword(userId, pin) });
  if (error) return false;
  await db.from("profiles").update({ is_member: true }).eq("id", userId);
  await db.from("pin_attempts").delete().eq("name_key", (await db.from("pin_logins").select("name_key").eq("user_id", userId).maybeSingle()).data?.name_key ?? "");
  return true;
}

/**
 * Removes name + PIN accounts that never finished being created: they have the name but no sign-in,
 * no picks and no payments, so nobody can ever use them. Only touches ones older than two minutes.
 */
async function clearUnfinishedSignups(name: string) {
  const db = createAdminClient();
  const { data: profiles } = await db.from("profiles").select("id, display_name, is_admin, created_at");
  const suspects = (profiles ?? []).filter((p) => !p.is_admin && sameName(p.display_name, name)
    && Date.now() - new Date(p.created_at).getTime() > 2 * 60_000);
  for (const p of suspects) {
    const [{ data: login }, { count: picks }, { count: pays }, { data: u }] = await Promise.all([
      db.from("pin_logins").select("user_id").eq("user_id", p.id).maybeSingle(),
      db.from("picks").select("user_id", { count: "exact", head: true }).eq("user_id", p.id),
      db.from("payments").select("user_id", { count: "exact", head: true }).eq("user_id", p.id),
      db.auth.admin.getUserById(p.id),
    ]);
    const unfinished = !login && !picks && !pays && u?.user?.user_metadata?.pin_login === true
      && (u.user.email ?? "").endsWith("@players.pickem.invalid");
    if (unfinished) await db.auth.admin.deleteUser(p.id);
  }
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
