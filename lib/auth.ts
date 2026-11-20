import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, is_member")
    .eq("id", user.id)
    .single<Profile>();
  return { supabase, user, profile };
}

export async function requireMember() {
  const v = await getViewer();
  if (!v.user) redirect("/login");
  if (!v.profile?.is_member && !v.profile?.is_admin) redirect("/join");
  return { ...v, user: v.user, profile: v.profile! };
}

export async function requireAdmin() {
  const v = await requireMember();
  if (!v.profile.is_admin) redirect("/");
  return v;
}
