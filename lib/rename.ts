import { createAdminClient } from "@/lib/supabase/admin";
import { cleanName, nameKey, validName } from "@/lib/pin";
import { sameName } from "@/lib/similar";

/**
 * Changes a player's leaderboard name. Names stay unique (ignoring spaces and capitals), and for
 * name + PIN players the name they sign in with changes too. Server code only.
 */
export async function renameUser(userId: string, raw: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = cleanName(raw);
  if (!validName(name)) return { ok: false, error: "Use 2 to 24 letters, numbers or spaces." };
  const db = createAdminClient();
  const [{ data: others }, { data: login }] = await Promise.all([
    db.from("profiles").select("display_name").neq("id", userId),
    db.from("pin_logins").select("name_key").eq("user_id", userId).maybeSingle(),
  ]);
  if ((others ?? []).some((o) => sameName(o.display_name, name))) {
    return { ok: false, error: `Someone is already called "${name}". Try adding a last initial, like "${name.split(" ")[0]} R".` };
  }
  if (login && login.name_key !== nameKey(name)) {
    const { error } = await db.from("pin_logins").update({ name_key: nameKey(name) }).eq("user_id", userId);
    if (error) return { ok: false, error: `Someone is already called "${name}".` };
  }
  const { error } = await db.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, name };
}
