import Link from "next/link";
import { requireMember } from "@/lib/auth";
import type { Contest, Game, Payment, Pick as PickRow } from "@/lib/types";
import { METHOD_LABEL, money } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, user, profile } = await requireMember();
  const [{ data: contests }, { data: myPicks }, { data: myPayments }] = await Promise.all([
    supabase.from("contests").select("*, games!games_contest_id_fkey(id, state, kickoff)").order("created_at", { ascending: false }).limit(30),
    supabase.from("picks").select("contest_id, game_id").eq("user_id", user.id),
    supabase.from("payments").select("*").eq("user_id", user.id),
  ]);
  const list = (contests ?? []) as (Contest & { games: Pick<Game, "id" | "state" | "kickoff">[] })[];
  const picksBy = new Map<number, number>();
  (myPicks as Pick<PickRow, "contest_id">[] | null)?.forEach((p) => picksBy.set(p.contest_id, (picksBy.get(p.contest_id) ?? 0) + 1));
  const payBy = new Map(((myPayments ?? []) as Payment[]).map((p) => [p.contest_id, p]));

  const open = list.filter((c) => c.status === "open");
  const closed = list.filter((c) => c.status === "closed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Pick ems</h1>
          <p className="text-slate-500">Pick a winner for every game before it kicks off.</p>
        </div>
        {profile.is_admin && <Link href="/admin/new" className="btn-primary">+ New pick em</Link>}
      </div>

      {open.length === 0 && (
        <div className="card text-slate-500">
          No open pick ems right now.{profile.is_admin ? " Create one from the Admin page." : " Check back soon."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {open.map((c) => <ContestCard key={c.id} c={c} picked={picksBy.get(c.id) ?? 0} pay={payBy.get(c.id)} />)}
      </div>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-500">Past weeks</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((c) => <ContestCard key={c.id} c={c} picked={picksBy.get(c.id) ?? 0} pay={payBy.get(c.id)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ContestCard({ c, picked, pay }: {
  c: Contest & { games: Pick<Game, "id" | "state" | "kickoff">[] }; picked: number; pay?: Payment;
}) {
  const total = c.games.length;
  const live = c.games.some((g) => g.state === "in");
  const done = total > 0 && c.games.every((g) => g.state === "post");
  const fee = Number(c.entry_fee);
  return (
    <Link href={`/contests/${c.id}`} className="card block transition hover:border-emerald-500">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
        <span className={c.league === "nfl" ? "text-blue-700 dark:text-blue-400" : "text-orange-700 dark:text-orange-400"}>
          {c.league === "nfl" ? "NFL" : "College"} · Week {c.week}
        </span>
        {live ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">LIVE</span>
          : done ? <span className="text-slate-400">Final</span> : null}
      </div>
      <h3 className="mt-1 text-lg font-bold">{c.name}</h3>
      <div className="mt-3 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-emerald-500" style={{ width: total ? `${(picked / total) * 100}%` : 0 }} />
      </div>
      <p className="mt-1 text-sm text-slate-500">{picked} of {total} picked</p>
      {fee > 0 && (
        <p className="mt-2 text-sm">
          Entry {money(fee)} ·{" "}
          {pay?.status === "verified" ? <span className="font-semibold text-emerald-600">Paid ✓</span>
            : pay ? <span className="font-semibold text-amber-600">{METHOD_LABEL[pay.method]} pending</span>
            : <span className="font-semibold text-red-600">Not paid</span>}
        </p>
      )}
    </Link>
  );
}
