import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

async function join(formData: FormData) {
  "use server";
  const { supabase } = await getViewer();
  const code = String(formData.get("code") || "");
  const { data } = await supabase.rpc("join_with_code", { join_code: code });
  if (data === true) redirect("/");
  redirect("/join?bad=1");
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string; bad?: string }> }) {
  const { user, profile } = await getViewer();
  if (!user) redirect("/login?next=/join");
  if (profile?.is_member || profile?.is_admin) redirect("/");
  const { code, bad } = await searchParams;
  return (
    <div className="mx-auto max-w-sm">
      <form action={join} className="card space-y-3">
        <h1 className="text-2xl font-black">Join the pool</h1>
        <p className="text-sm text-slate-500">Enter the invite code the pool admin sent you.</p>
        <input name="code" className="input font-mono" defaultValue={code ?? ""} required placeholder="Invite code" />
        {bad && <p className="text-sm text-red-600">That code didn&apos;t work. Double-check it with the admin.</p>}
        <button className="btn-primary w-full">Join</button>
      </form>
    </div>
  );
}
