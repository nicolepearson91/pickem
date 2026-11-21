import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phone notifications. The keys that sign them are made once and kept in the database (server-only table),
 * so there's nothing to set up in Vercel. Server code only.
 */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (error) return null; // notifications SQL not run yet
  if (data) return { publicKey: data.public_key, privateKey: data.private_key };
  const k = webpush.generateVAPIDKeys();
  // If two requests race, the first one wins and everyone uses its keys.
  await db.from("push_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: saved } = await db.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
  return saved ? { publicKey: saved.public_key, privateKey: saved.private_key } : null;
}

export interface PushMessage { title: string; body: string; url?: string; tag?: string }

/** Sends a notification to every phone a set of users turned notifications on for. Returns how many were delivered. */
export async function sendPush(userIds: string[], msg: PushMessage): Promise<number> {
  if (userIds.length === 0) return 0;
  const keys = await vapidKeys();
  if (!keys) return 0;
  const db = createAdminClient();
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { vapidDetails: { subject: "https://pickem-three.vercel.app", publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 3600 },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // The phone turned notifications off or the app was removed: forget it.
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));
  return sent;
}

export async function adminIds(): Promise<string[]> {
  const { data } = await createAdminClient().from("profiles").select("id").eq("is_admin", true);
  return (data ?? []).map((p) => p.id);
}
