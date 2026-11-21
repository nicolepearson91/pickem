import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { newInviteCode, removePayment, saveSettings, setMember, verifyPayment } from "./actions";
import { METHOD_LABEL, money } from "@/lib/payments";
import CopyButton from "@/components/CopyButton";
import ResetLinkButton from "@/components/ResetLinkButton";
import ResetPinButton from "@/components/ResetPinButton";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppSettings, Contest, Payment, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user } = await requireAdmin();
  const [{ data: settings }, { data: invite }, { data: contests }, { data: people }, { data: pays }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single<AppSettings>(),
    supabase.from("invite").select("code").eq("id", 1).single<{ code: string }>(),
    supabase.from("contests").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name, is_admin, is_member").order("display_name"),
    supabase.from("payments").select("*"),
  ]);
  const allPays = (pays ?? []) as Payment[];
  const contestBy = new Map(((contests ?? []) as Contest[]).map((c) => [c.id, c]));
  const nameBy = new Map(((people ?? []) as Profile[]).map((p) => [p.id, p.display_name]));
  const waiting = allPays.filter((p) => p.status === "pending" && contestBy.has(p.contest_id))
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const pendingBy = new Map<number, number>();
  waiting.forEach((p) => pendingBy.set(p.contest_id, (pendingBy.get(p.contest_id) ?? 0) + 1));
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

      <section className={`card space-y-3 ${waiting.length ? "border-amber-400" : ""}`}>
        <h2 className="text-lg font-bold">Payments to confirm{waiting.length > 0 && <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-sm text-slate-900">{waiting.length}</span>}</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing waiting. When a player taps &quot;I paid&quot;, it shows up here for you to confirm. To mark someone who paid
            you in person, tap <strong>Payments</strong> next to the pick em below.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500">Check Venmo, Cash App, Apple Cash, or your cash first. The app can&apos;t see whether money arrived.</p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {waiting.map((p) => {
                const c = contestBy.get(p.contest_id)!;
                return (
                  <li key={`${p.contest_id}:${p.user_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold">{nameBy.get(p.user_id) ?? "Someone"}</span>
                      <span className="text-slate-400"> says they sent {money(Number(c.entry_fee))} by {METHOD_LABEL[p.method]} · {c.name}</span>
                    </span>
                    <span className="flex gap-2">
                      <form action={verifyPayment.bind(null, p.contest_id, p.user_id, true)}><button className="btn-primary">Confirm received</button></form>
                      <form action={removePayment.bind(null, p.contest_id, p.user_id)}><button className="btn-danger">Not received</button></form>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

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
                <span className="text-sm text-slate-500">· {c.league.toUpperCase()} week {c.week} · {Number(c.entry_fee) > 0 ? `${money(Number(c.entry_fee))} entry` : "free"} · {c.status}</span>
              </span>
              <span className="flex gap-2">
                <Link className="btn-ghost" href={`/contests/${c.id}`}>View</Link>
                {Number(c.entry_fee) > 0 && (
                  <Link className="btn-primary" href={`/admin/contests/${c.id}`}>
                    Payments{pendingBy.get(c.id) ? ` (${pendingBy.get(c.id)} to confirm)` : ""}
                  </Link>
                )}
                <Link className="btn-ghost" href={`/admin/contests/${c.id}`}>Settings &amp; delete</Link>
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
