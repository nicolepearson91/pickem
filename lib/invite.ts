import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/** The pool's invite link, or null when the admin has turned off sharing for players. Server code only. */
export async function inviteLink(forAdmin = false): Promise<{ link: string | null; playersCanInvite: boolean; settingReady: boolean }> {
  const db = createAdminClient();
  const [{ data: invite }, { data: settings }] = await Promise.all([
    db.from("invite").select("code").eq("id", 1).maybeSingle(),
    db.from("app_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const settingReady = settings ? "players_can_invite" in settings : false;
  // Until the setting exists, sharing is on.
  const playersCanInvite = settings?.players_can_invite !== false;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = process.env.VERCEL_ENV === "production" ? `https://${process.env.SITE_HOST || "pickem-three.vercel.app"}` : `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const link = invite?.code && (forAdmin || playersCanInvite) ? `${origin}/join?code=${invite.code}` : null;
  return { link, playersCanInvite, settingReady };
}
