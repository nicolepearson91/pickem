import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteContest, recordPayment, removePayment, setContestStatus, setEntryFee, setLockAtFirstKickoff, setSplit, verifyPayment } from "../../actions";
import { METHOD_LABEL, money } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import NewWeekTools from "@/components/NewWeekTools";
import type { Contest, Payment, PayMethod, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminContestPage({ params }: { params: Promise<{ id: string }> }) {
  const cid = Number((await params).id);
  const { supabase } = await requireAdmin();
  const [{ data: contest }, { data: payments }, { data: people }, { data: picks }] = await Promise.all([
    supabase.from("contests").select("*").eq("id", cid).maybeSingle<Contest>(),
    supabase.from("payments").select("*").eq("contest_id", cid),
    supabase.from("profiles").select("id, display_name, is_admin, is_member").order("display_name"),
    // Counting picks per person; admins see all picks only after kickoff, so this is "picks visible so far".
    supabase.from("picks").select("user_id").eq("contest_id", cid),
  ]);
  if (!contest) notFound();
  // Real totals for the delete warning (picks stay hidden from everyone until kickoff, even the admin).
  const { count: pickCount } = await createAdminClient().from("picks").select("user_id", { count: "exact", head: true }).eq("contest_id", cid);
  const payBy = new Map(((payments ?? []) as Payment[]).map((p) => [p.user_id, p]));
  const players = ((people ?? []) as Profile[]).filter((p) => p.is_member || p.is_admin);
  const played = new Set((picks ?? []).map((p) => p.user_id));
  const fee = Number(contest.entry_fee);
  const verified = [...payBy.values()].filter((p) => p.status === "verified");
  const pending = [...payBy.values()].filter((p) => p.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link>
          <h1 className="text-3xl font-black">{contest.name}</h1>
        </div>
        <Link href={`/contests/${cid}`} className="btn-ghost">View pick em</Link>
      </div>

      <form action={setEntryFee.bind(null, cid)} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="fee">Entry fee ($)</label>
          <input id="fee" name="fee" type="number" min={0} step="0.01" className="input w-32" defaultValue={fee} />
        </div>
        <button className="btn-ghost">Save fee</button>
        <p className="w-full text-xs text-slate-500">Set to 0 for a free pick em. With a fee, players see your Venmo, Cash App and Apple Cash and can tap &quot;I paid&quot;.</p>
      </form>

      <section className="card space-y-2">
        <h2 className="font-bold">Let players know</h2>
        <p className="text-sm text-slate-500">
          Players with notifications on got an alert when you created this. Text the group too, for anyone without them.
        </p>
        <NewWeekTools contestId={cid} name={contest.name} link={await contestLink(cid)} />
      </section>

      <form action={setLockAtFirstKickoff.bind(null, cid, !contest.lock_at_first_kickoff)} className="card flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-bold">When picks lock</h2>
          <p className="text-sm text-slate-500">
            {contest.lock_at_first_kickoff
              ? "Every pick locks when the first game kicks off."
              : "Each game locks at its own kickoff, so players can still pick later games."}
          </p>
          {contest.lock_at_first_kickoff === undefined && <p className="text-xs text-amber-300">Run the lock-at-first-kickoff SQL in Supabase to change this.</p>}
        </div>
        <button className="btn-ghost" disabled={contest.lock_at_first_kickoff === undefined}>
          {contest.lock_at_first_kickoff ? "Switch to each game at its kickoff" : "Lock everything at first kickoff"}
        </button>
      </form>

      <form action={setSplit.bind(null, cid)} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="split">How the pot is paid out</label>
          <select id="split" name="second_pct" className="input w-auto" defaultValue={String(contest.second_place_pct ?? 0)}>
            <option value="0">Winner takes all</option>
            <option value="20">80% to 1st, 20% to 2nd</option>
            <option value="25">75% to 1st, 25% to 2nd</option>
            <option value="30">70% to 1st, 30% to 2nd</option>
            <option value="40">60% to 1st, 40% to 2nd</option>
          </select>
        </div>
        <button className="btn-ghost">Save split</button>
        <p className="w-full text-xs text-slate-500">
          {contest.second_place_pct === undefined
            ? "Run the payouts setup SQL in Supabase to turn this on."
            : "Ties split the prize money for the places they share. Winners and amounts show on the pick em once every game is final."}
        </p>
      </form>

      {fee > 0 ? (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Payments · {money(fee)} entry</h2>
            <p className="text-sm text-slate-500">
              {verified.length} confirmed ({money(verified.length * fee)}) · {pending.length} waiting on you
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Check Venmo, Cash App, Apple Cash, or your cash before you confirm. The app can&apos;t see whether money arrived.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {players.map((p) => {
              const pay = payBy.get(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">{p.display_name}</span>
                    {!played.has(p.id) && <span className="ml-2 text-xs text-slate-400">no visible picks yet</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {pay?.status === "verified" ? (
                      <>
                        <span className="font-semibold text-emerald-600">✓ Paid · {METHOD_LABEL[pay.method]}</span>
                        <form action={verifyPayment.bind(null, cid, p.id, false)}><button className="btn-ghost">Undo</button></form>
                      </>
                    ) : pay ? (
                      <>
                        <span className="font-semibold text-amber-600">Says paid by {METHOD_LABEL[pay.method]}</span>
                        <form action={verifyPayment.bind(null, cid, p.id, true)}><button className="btn-primary">Confirm received</button></form>
                        <form action={removePayment.bind(null, cid, p.id)}><button className="btn-danger">Not received</button></form>
                      </>
                    ) : (
                      <>
                        <span className="text-red-600">Unpaid</span>
                        {(["cash", "venmo", "cashapp", "applecash"] as PayMethod[]).map((m) => (
                          <form key={m} action={recordPayment.bind(null, cid, p.id, m)}>
                            <button className="btn-ghost text-xs">Got {METHOD_LABEL[m]}</button>
                          </form>
                        ))}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="card text-sm text-slate-500">This pick em is free, so there are no payments to track. Set an entry fee above to collect money.</p>
      )}

      <section className="card flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-bold">Status: {contest.status === "open" ? "Open" : "Closed"}</h2>
        <form action={setContestStatus.bind(null, cid, contest.status === "open" ? "closed" : "open")}>
          <button className="btn-ghost">{contest.status === "open" ? "Close (stop picks; scores keep updating)" : "Reopen"}</button>
        </form>
        <details className="relative">
          <summary className="btn-danger list-none">Delete pick em</summary>
          <form action={deleteContest.bind(null, cid)} className="mt-2 flex items-center gap-2 text-sm">
            <span>
              {(pickCount ?? 0) > 0 || (payments ?? []).length > 0
                ? <><strong className="text-red-400">Heads up:</strong> {pickCount ?? 0} pick{pickCount === 1 ? "" : "s"} and {(payments ?? []).length} payment record{(payments ?? []).length === 1 ? "" : "s"} will be erased too. This can&apos;t be undone.</>
                : "Nobody has picked yet. This can't be undone."}
            </span>
            <button className="btn bg-red-600 text-white hover:bg-red-700">Yes, delete</button>
          </form>
        </details>
      </section>
    </div>
  );
}

async function contestLink(id: number) {
  if (process.env.VERCEL_ENV === "production") return `https://${process.env.SITE_HOST || "pickem-three.vercel.app"}/contests/${id}`;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/contests/${id}`;
}
