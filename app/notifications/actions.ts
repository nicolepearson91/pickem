"use server";

import { requireAdmin, requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminIds, sendPush, vapidKeys } from "@/lib/push";
import { METHOD_LABEL, money } from "@/lib/payments";
import type { PayMethod } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

export async function pushPublicKey(): Promise<{ key: string | null }> {
  await requireAdmin();
  const k = await vapidKeys();
  return { key: k?.publicKey ?? null };
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Result> {
  const { user } = await requireAdmin();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, error: "That didn't work. Try again." };
  const { error } = await createAdminClient().from("push_subscriptions").upsert({
    endpoint: sub.endpoint, user_id: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const { user } = await requireAdmin();
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  return { ok: true };
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const { user } = await requireAdmin();
  const sent = await sendPush([user.id], { title: "Pick Em", body: "Payment alerts are on. You'll get one when a player taps I paid.", url: "/admin", tag: "test" });
  return { sent };
}

/** Called right after a player marks their entry as sent. Tells the admin. */
export async function notifyPaymentClaimed(contestId: number): Promise<void> {
  const { supabase, user, profile } = await requireMember();
  // Only for a real, still-unconfirmed payment by this player.
  const { data: pay } = await supabase.from("payments").select("method, status")
    .eq("contest_id", contestId).eq("user_id", user.id).maybeSingle<{ method: PayMethod; status: string }>();
  if (!pay || pay.status !== "pending") return;
  const { data: c } = await supabase.from("contests").select("name, entry_fee").eq("id", contestId).maybeSingle();
  const admins = (await adminIds()).filter((id) => id !== user.id);
  await sendPush(admins, {
    title: `💵 ${profile.display_name} says they paid`,
    body: `${money(Number(c?.entry_fee ?? 0))} by ${METHOD_LABEL[pay.method]} for ${c?.name ?? "the pick em"}. Tap to confirm.`,
    url: "/admin",
    tag: `pay-${contestId}-${user.id}`,
  });
}
