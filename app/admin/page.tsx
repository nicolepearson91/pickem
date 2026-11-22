import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { newInviteCode, removePayment, saveSettings, setMember, setPlayersCanInvite, verifyPayment } from "./actions";
import InviteFriendsButton from "@/components/InviteFriendsButton";
import PushToggle from "@/components/PushToggle";
import { inviteLink } from "@/lib/invite";
import { METHOD_LABEL, money } from "@/lib/payments";
import CopyButton from "@/components/CopyButton";
import ResetLinkButton from "@/components/ResetLinkButton";
import ResetPinButton from "@/components/ResetPinButton";
import PlayerTools from "@/components/PlayerTools";
import { looksAlike } from "@/lib/similar";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppSettings, Contest, Payment, Profile } from "@/lib/types";
import type { SquaresBoard, SquaresPayment } from "@/lib/squares";
import { confirmSquaresPayment, rejectSquaresPayment } from "./squares/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, user } = await requireAdmin();
  const [{ data: settings }, { data: invite }, { data: contests }, { data: people }, { data: pays }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", 1).single<AppSettings>(),
    supabase.from("invite").select("code").eq("id", 1).single<{ code: string }>(),
    supabase.from("contests").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name, is_admin, is_member, created_at").order("display_name"),
    supabase.from("payments").select("*"),
  ]);
  // Squares tables come from the squares SQL; until it's run these come back empty.
  const [{ data: boardRows, error: boardsErr }, { data: sqPayRows }, { data: sqRows }] = await Promise.all([
    supabase.from("squares_boards").select("*").order("created_at", { ascending: false }),
    supabase.from("squares_payments").select("*").eq("status", "pending"),
    supabase.from("squares").select("board_id"),
  ]);
  const boards = (boardRows ?? []) as SquaresBoard[];
  const boardBy = new Map(boards.map((b) => [b.id, b]));
  const sqWaiting = ((sqPayRows ?? []) as SquaresPayment[]).filter((p) => boardBy.has(p.board_id) && p.squares > p.verified_squares)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const sqPendingBy = new Map<number, number>();
  sqWaiting.forEach((p) => sqPendingBy.set(p.board_id, (sqPendingBy.get(p.board_id) ?? 0) + 1));
  const takenBy = new Map<number, number>();
  (sqRows ?? []).forEach((r) => takenBy.set(r.board_id, (takenBy.get(r.board_id) ?? 0) + 1));
  const allPays = (pays ?? []) as Payment[];
  const contestBy = new Map(((contests ?? []) as Contest[]).map((c) => [c.id, c]));
  const nameBy = new Map(((people ?? []) as Profile[]).map((p) => [p.id, p.display_name]));
  const waiting = allPays.filter((p) => p.status === "pending" && contestBy.has(p.contest_id))
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const pendingBy = new Map<number, number>();
  waiting.forEach((p) => pendingBy.set(p.contest_id, (pendingBy.get(p.contest_id) ?? 0) + 1));
  // Which players sign in with a name and PIN (only the server can read this list).
  const service = createAdminClient();
  const [{ data: pinRows }, { data: pickRows }, { data: authList }] = await Promise.all([
    service.from("pin_logins").select("user_id, name_key"),
    // Picks stay hidden from everyone until kickoff, so count them with the server key.
    service.from("picks").select("user_id"),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const pinName = new Map((pinRows ?? []).map((r) => [r.user_id as string, r.name_key as string]));
  const pickCount = new Map<string, number>();
  (pickRows ?? []).forEach((r) => pickCount.set(r.user_id, (pickCount.get(r.user_id) ?? 0) + 1));
  const payCount = new Map<string, number>();
  allPays.forEach((p) => payCount.set(p.user_id, (payCount.get(p.user_id) ?? 0) + 1));
  const players = (people ?? []) as (Profile & { created_at: string })[];
  // A name + PIN sign-up that broke halfway: it has a name but no way to sign in.
  const unfinished = new Set((authList?.users ?? [])
    .filter((u) => u.email?.endsWith("@players.pickem.invalid") && !pinName.has(u.id)).map((u) => u.id));
  const login = (id: string) => (pinName.has(id) ? "name + PIN" : unfinished.has(id) ? "unfinished sign-up, can't sign in" : "email");
  // Accounts whose names look like someone else's, probably the same person who joined twice.
  const alikeOf = new Map(players.map((p) => [p.id, players.filter((o) => o.id !== p.id && looksAlike(o.display_name, p.display_name))]));
  const dupeCount = players.filter((p) => (alikeOf.get(p.id) ?? []).length > 0).length;
  const joined = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const shared = await inviteLink(true);
  // Notifications need the push setup SQL; until it's run this lookup errors.
  const { error: pushErr } = await service.from("push_subscriptions").select("endpoint").limit(1);
  const link = shared.link ?? `${origin}/join?code=${invite?.code ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black">Admin</h1>
        <Link href="/admin/new" className="btn-primary">+ New pick em</Link>
      </div>

      <section className={`card space-y-3 ${waiting.length ? "border-amber-400" : ""}`}>
        <h2 className="text-lg font-bold">Payments to confirm{waiting.length + sqWaiting.length > 0 && <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-sm text-slate-900">{waiting.length + sqWaiting.length}</span>}</h2>
        {waiting.length + sqWaiting.length === 0 ? (
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
              {sqWaiting.map((p) => {
                const b = boardBy.get(p.board_id)!;
                const n = p.squares - p.verified_squares;
                return (
                  <li key={`sq:${p.board_id}:${p.user_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold">{nameBy.get(p.user_id) ?? "Someone"}</span>
                      <span className="text-slate-400"> says they sent {money(n * Number(b.price))} by {METHOD_LABEL[p.method]} for {n} square{n === 1 ? "" : "s"} · {b.name}</span>
                    </span>
                    <span className="flex gap-2">
                      <form action={confirmSquaresPayment.bind(null, p.board_id, p.user_id)}><button className="btn-primary">Confirm received</button></form>
                      <form action={rejectSquaresPayment.bind(null, p.board_id, p.user_id)}><button className="btn-danger">Not received</button></form>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-bold">Payment alerts</h2>
        <p className="text-sm text-slate-500">Get a notification on your phone whenever a player taps &quot;I paid&quot;. Turn it on separately on each phone or computer.</p>
        <PushToggle ready={!pushErr} />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Invite players</h2>
        <p className="text-sm text-slate-500">Send this link to people you want in the pool. They create an account and they&apos;re in.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 font-mono text-sm dark:bg-slate-800">{link}</code>
          <CopyButton text={link} />
          <InviteFriendsButton link={link} className="btn-primary" />
          <form action={newInviteCode}><button className="btn-ghost">New code</button></form>
        </div>
        <form action={setPlayersCanInvite.bind(null, !shared.playersCanInvite)} className="flex flex-wrap items-center gap-3 text-sm">
          <span className={shared.playersCanInvite ? "text-emerald-400" : "text-slate-400"}>
            {shared.playersCanInvite ? "✓ Players can share this link with friends (Invite friends button on their home page)" : "Only you can share this link right now"}
          </span>
          <button className="btn-ghost" disabled={!shared.settingReady}>{shared.playersCanInvite ? "Turn off" : "Turn on"}</button>
          {!shared.settingReady && <span className="text-xs text-slate-500">Run the invite sharing SQL in Supabase to be able to turn this off.</span>}
        </form>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Squares boards</h2>
          {!boardsErr && <Link href="/admin/squares/new" className="btn-ghost">+ New squares board</Link>}
        </div>
        {boardsErr ? (
          <p className="text-sm text-amber-300">Super Bowl squares need a one-time setup: run the squares SQL in Supabase.</p>
        ) : boards.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {boards.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{b.name}</span>{" "}
                  <span className="text-sm text-slate-500">· {money(Number(b.price))} a square · {takenBy.get(b.id) ?? 0}/100 taken · {b.col_digits ? "numbers drawn" : "numbers not drawn"} · {b.status}</span>
                </span>
                <span className="flex gap-2">
                  <Link className="btn-ghost" href={`/squares/${b.id}`}>View</Link>
                  <Link className={sqPendingBy.get(b.id) ? "btn-primary" : "btn-ghost"} href={`/admin/squares/${b.id}`}>
                    Manage{sqPendingBy.get(b.id) ? ` (${sqPendingBy.get(b.id)} to confirm)` : ""}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
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
        {dupeCount > 0 && (
          <p className="rounded-lg bg-amber-950/50 p-3 text-sm text-amber-200">
            Some names look alike, marked &ldquo;possible duplicate&rdquo; below. If it&apos;s the same person, tap <strong>Rename, merge or delete</strong> on
            the extra account and merge it into the one they use. Their picks and payments move over.
          </p>
        )}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {players.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-semibold">
                {p.display_name}
                {p.is_admin && <span className="ml-2 text-xs text-emerald-600">admin</span>}
                {!p.is_member && !p.is_admin && <span className="ml-2 text-xs text-amber-600">not in the pool</span>}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {login(p.id)} · joined {joined(p.created_at)} · {pickCount.get(p.id) ?? 0} picks · {payCount.get(p.id) ?? 0} payments
                </span>
                {(alikeOf.get(p.id) ?? []).length > 0 && (
                  <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                    possible duplicate of {alikeOf.get(p.id)!.map((o) => o.display_name).join(", ")}
                  </span>
                )}
              </span>
              {p.id !== user.id && (
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {pinName.has(p.id)
                    ? <ResetPinButton userId={p.id} name={p.display_name} />
                    : <ResetLinkButton userId={p.id} name={p.display_name} />}
                  <form action={setMember.bind(null, p.id, !p.is_member)}>
                    <button className="btn-ghost">{p.is_member ? "Remove from pool" : "Let in"}</button>
                  </form>
                  {!p.is_admin && (
                    <PlayerTools id={p.id} name={p.display_name} picks={pickCount.get(p.id) ?? 0} payments={payCount.get(p.id) ?? 0}
                      suggest={(alikeOf.get(p.id) ?? []).sort((a, b) => (pickCount.get(b.id) ?? 0) - (pickCount.get(a.id) ?? 0))[0]?.id}
                      others={players.filter((o) => o.id !== p.id).map((o) => ({
                        id: o.id, name: o.display_name, label: `${o.display_name} (${login(o.id)}, ${pickCount.get(o.id) ?? 0} picks)`,
                      }))} />
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
