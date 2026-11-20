import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";

async function rename(formData: FormData) {
  "use server";
  const { supabase, user } = await requireMember();
  const name = String(formData.get("name") || "").trim().slice(0, 40);
  if (name) await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  revalidatePath("/", "layout");
}

export default async function AccountPage() {
  const { profile } = await requireMember();
  return (
    <div className="mx-auto max-w-sm">
      <form action={rename} className="card space-y-3">
        <h1 className="text-2xl font-black">Your account</h1>
        <div>
          <label className="label" htmlFor="name">Name on the leaderboard</label>
          <input id="name" name="name" className="input" defaultValue={profile.display_name} maxLength={40} required />
        </div>
        <button className="btn-primary">Save</button>
      </form>
    </div>
  );
}
