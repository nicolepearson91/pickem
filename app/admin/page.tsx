import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { newInviteCode, saveSettings, setMember } from "./actions";
import CopyButton from "@/components/CopyButton";
import ResetLinkButton from "@/components/ResetLinkButton";
import ResetPinButton from "@/components/ResetPinButton";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppSettings, Contest, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user } = await requireAdmin();
  const [{ data: settings }, { data: invite }, { data: contests }, { data: people }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single<AppSettings>(),
    supabase.from("invite").select("code").eq("id", 1).single<{ code: string }>(),
    supabase.from("contests").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name, is_admin, is_member").order("display_name"),
  ]);
  // Which players sign in with a name and PIN (only the server can read this list).
  const { data: pinRows } = await createAdminClient().from("pin_logins").select("user_id, name_key");
  const pinName = new Map((pinRows ?? []).map((r) => [r.user_id as string, r.name_key as string]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const link = `${origin}/join?code=${invite?.code ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Admin</h1>
        <Link href="/admin/new" className="btn-primary">+ New pick em</Link>
      </div>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Invite players</h2>
        <p className="text-sm text-slate-500">Send this link to people you want in the pool. They create an account and they&apos;re in.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 font-mono text-sm dark:bg-slate-800">{link}</code>
          <CopyButton text={link} />
          <form action={newInviteCode}><button className="btn-ghost">New code</button></form>
        </div>
        <p className="text-xs text-slate-500">Making a new code stops the old link from working. People already in stay in.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Pick ems</h2>
        {(contests ?? []).length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {((contests ?? []) as Contest[]).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold">{c.name}</span>{" "}
                <span className="text-sm text-slate-500">· {c.league.toUpperCase()} week {c.week} · {c.status}</span>
              </span>
              <span className="flex gap-2">
                <Link className="btn-ghost" href={`/contests/${c.id}`}>View</Link>
                <Link className="btn-ghost" href={`/admin/contests/${c.id}`}>Payments, settings &amp; delete</Link>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Where players send money</h2>
        <p className="text-sm text-slate-500">Leave any of these blank to hide that option. Cash is always offered.</p>
        <form action={saveSettings} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="venmo">Venmo username</label>
            <input id="venmo" name="venmo_handle" className="input" placeholder="@your-name" defaultValue={settings?.venmo_handle ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="cashapp">Cash App $cashtag</label>
            <input id="cashapp" name="cashapp_tag" className="input" placeholder="$YourTag" defaultValue={settings?.cashapp_tag ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="apple">Apple Cash phone or email</label>
            <input id="apple" name="apple_cash_contact" className="input" placeholder="(555) 555-1234" defaultValue={settings?.apple_cash_contact ?? ""} />
          </div>
          <div className="sm:col-span-3"><button className="btn-primary">Save</button></div>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Players</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {((people ?? []) as Profile[]).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="font-semibold">
                {p.display_name}
                {p.is_admin && <span className="ml-2 text-xs text-emerald-600">admin</span>}
                {!p.is_member && !p.is_admin && <span className="ml-2 text-xs text-amber-600">not in the pool</span>}
                {pinName.has(p.id) && <span className="ml-2 text-xs font-normal text-slate-400">name + PIN</span>}
              </span>
              {p.id !== user.id && (
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {pinName.has(p.id)
                    ? <ResetPinButton userId={p.id} name={p.display_name} />
                    : <ResetLinkButton userId={p.id} name={p.display_name} />}
                  <form action={setMember.bind(null, p.id, !p.is_member)}>
                    <button className={p.is_member ? "btn-danger" : "btn-ghost"}>{p.is_member ? "Remove" : "Let in"}</button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
