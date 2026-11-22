"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { contestStandings, ordinal, type StandingRow } from "@/lib/scoring";
import type { AppSettings, Contest, Game, Payment, Payout, PayoutInfo, Pick, Profile, Side, Tiebreaker } from "@/lib/types";
import LocalTime from "./LocalTime";
import PaymentPanel from "./PaymentPanel";
import PayoutPanel from "./PayoutPanel";
import { computePayouts } from "@/lib/payouts";
import { useLiveContest } from "./useLiveContest";
import { METHOD_LABEL, money, potTotals } from "@/lib/payments";

interface Props {
  me: Profile;
  userId: string;
  contest: Contest;
  games: Game[];
  picks: Pick[];
  tiebreakers: Tiebreaker[];
  payments: Payment[];
  people: Profile[];
  /** Everyone who has made a pick, even ones still hidden. */
  playerIds: string[];
  settings: AppSettings;
  payouts: Payout[];
  payoutInfo: PayoutInfo[];
}

/** weekStarted: some game in this pick em has kicked off (matters when it locks at first kickoff). */
export const isLocked = (g: Game, c: Contest, weekStarted = false) =>
  c.status !== "open" || g.state !== "pre" || new Date(g.kickoff).getTime() <= Date.now()
  || (!!c.lock_at_first_kickoff && weekStarted);

export default function ContestView(p: Props) {
  const { contest, games, userId } = p;
  useLiveContest(contest.id, games);

  const started = games.some((g) => g.state !== "pre" || new Date(g.kickoff).getTime() <= Date.now());
  const [tab, setTab] = useState<"picks" | "board">(started ? "board" : "picks");

  // My picks, updated optimistically and re-synced whenever the server sends new data.
  const serverMine = useMemo(
    () => Object.fromEntries(p.picks.filter((x) => x.user_id === userId).map((x) => [x.game_id, x.side])) as Record<number, Side>,
    [p.picks, userId],
  );
  const [mine, setMine] = useState(serverMine);
  useEffect(() => setMine(serverMine), [serverMine]);
  const [error, setError] = useState<string | null>(null);

  const allPicks = useMemo(() => {
    const others = p.picks.filter((x) => x.user_id !== userId);
    const own = Object.entries(mine).map(([gid, side]) => ({ user_id: userId, game_id: Number(gid), contest_id: contest.id, side }));
    return [...others, ...own];
  }, [p.picks, mine, userId, contest.id]);

  const standings = useMemo(
    () => contestStandings(p.people, games, allPicks, p.tiebreakers, contest.tiebreaker_game_id,
      [...p.playerIds, ...p.payments.map((x) => x.user_id)]),
    [p.people, games, allPicks, p.tiebreakers, contest.tiebreaker_game_id, p.payments, p.playerIds],
  );

  async function choose(g: Game, side: Side) {
    if (isLocked(g, contest, started)) return;
    const prev = mine[g.id];
    setMine((m) => ({ ...m, [g.id]: side }));
    setError(null);
    const { error } = await createClient()
      .from("picks")
      .upsert({ user_id: userId, game_id: g.id, contest_id: contest.id, side }, { onConflict: "user_id,game_id" });
    if (error) {
      setMine((m) => {
        const n = { ...m };
        if (prev) n[g.id] = prev; else delete n[g.id];
        return n;
      });
      setError("That pick didn't save. The game may have just locked.");
    }
  }

  const pickedCount = games.filter((g) => mine[g.id]).length;
  const myRow = standings.find((r) => r.user_id === userId);
  const live = games.some((g) => g.state === "in");
  const fee = Number(contest.entry_fee);
  const pot = potTotals(p.payments, fee);
  const finished = games.length > 0 && games.every((g) => g.state === "post");
  const secondPct = contest.second_place_pct ?? 0;
  const winners = finished ? computePayouts(standings, pot.pot, secondPct) : [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-[radial-gradient(120%_120%_at_0%_0%,#163a80_0%,#0f1730_55%,#0b1020_100%)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          {contest.league === "nfl" ? "NFL" : "College football"} · Week {contest.week}
          {contest.status === "closed" && " · Closed"}
        </p>
        <h1 className="mt-1 text-4xl font-bold leading-none text-white sm:text-5xl">{contest.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {contest.lock_at_first_kickoff && games.length > 0 && contest.status === "open" && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${started ? "bg-slate-700 text-slate-200" : "bg-amber-400 text-slate-900"}`}>
              {started ? "🔒 All picks locked" : <>⏰ All picks lock at <LocalTime iso={[...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0].kickoff} /></>}
            </span>
          )}
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          )}
          {myRow && started && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-400">
              You&apos;re {ordinal(myRow.place)} · {myRow.correct}–{myRow.wrong}
            </span>
          )}
        </div>
        {fee > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pot</p>
              <p className="font-display text-4xl font-bold leading-none text-amber-300 tabular-nums">{money(pot.pot)}</p>
            </div>
            <p className="pb-1 text-sm text-slate-400">
              {pot.paid} paid at {money(fee)}
              {pot.pending > 0 && <> · <span className="text-amber-300">{money(pot.pendingAmount)} pending</span> from {pot.pending} more</>}
              {secondPct > 0 && <> · {100 - secondPct}/{secondPct} split for 1st and 2nd</>}
            </p>
          </div>
        )}
      </div>

      {winners.length > 0 && (
        <PayoutPanel contestId={contest.id} contestName={contest.name} rows={winners} payouts={p.payouts} info={p.payoutInfo}
          isAdmin={p.me.is_admin} userId={userId} secondPct={secondPct} />
      )}

      {fee > 0 && (
        <PaymentPanel contest={contest} userId={userId} settings={p.settings}
          payment={p.payments.find((x) => x.user_id === userId)} adminName={p.people.find((x) => x.is_admin)?.display_name} />
      )}

      <div>
      <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1 text-sm font-bold sm:w-fit">
        {(["picks", "board"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-5 py-2 sm:flex-none ${tab === t ? "bg-slate-700 text-white" : "text-slate-400"}`}>
            {t === "picks" ? `My picks ${pickedCount}/${games.length}` : "Dashboard"}
          </button>
        ))}
      </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {tab === "picks" ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {games.map((g) => (
              <GameCard key={g.id} g={g} locked={isLocked(g, contest, started)} pick={mine[g.id]} onPick={(s) => choose(g, s)}
                isTiebreaker={g.id === contest.tiebreaker_game_id} />
            ))}
          </div>
          {contest.tiebreaker_game_id && (
            <TiebreakerBox contest={contest} userId={userId} locked={started}
              game={games.find((g) => g.id === contest.tiebreaker_game_id)}
              value={p.tiebreakers.find((t) => t.user_id === userId)?.total_points} />
          )}
        </div>
      ) : (
        <Board games={games} picks={allPicks} standings={standings} userId={userId} contest={contest}
          payments={p.payments} tiebreakers={p.tiebreakers} />
      )}
    </div>
  );
}

function TeamLine({ name, abbr, logo, rank, score, color, showScore, win }: {
  name: string; abbr: string; logo: string | null; rank: number | null; score: number | null;
  color: string | null; showScore: boolean; win: boolean;
}) {
  return (
    <span className="flex w-full items-center gap-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white"
          style={{ background: color ?? "#2a3658" }}>{abbr}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-left text-[15px] font-bold text-white">
        {rank && <span className="mr-1.5 text-xs font-semibold text-slate-400">#{rank}</span>}
        {name}
      </span>
      {showScore && (
        <span className={`font-display text-2xl font-bold tabular-nums ${win ? "text-white" : "text-slate-500"}`}>{score ?? 0}</span>
      )}
    </span>
  );
}

function GameCard({ g, locked, pick, onPick, isTiebreaker }: {
  g: Game; locked: boolean; pick?: Side; onPick: (s: Side) => void; isTiebreaker: boolean;
}) {
  const showScore = g.state !== "pre";
  const final = g.state === "post" && g.winner;
  const btn = (side: Side) => {
    const selected = pick === side;
    const right = final && selected && g.winner === side;
    const wrong = final && selected && g.winner !== side;
    const t = side === "home"
      ? { name: g.home_name, abbr: g.home_abbr, logo: g.home_logo, rank: g.home_rank, score: g.home_score, color: g.home_color ?? null }
      : { name: g.away_name, abbr: g.away_abbr, logo: g.away_logo, rank: g.away_rank, score: g.away_score, color: g.away_color ?? null };
    const state = right ? "border-emerald-400 bg-emerald-50"
      : wrong ? "border-red-600 bg-red-50"
      : selected ? "border-emerald-400 bg-emerald-50 shadow-[0_0_18px_-8px_var(--color-emerald-400)]"
      : "border-slate-700/70 bg-slate-950/60";
    return (
      <button type="button" disabled={locked} onClick={() => onPick(side)} aria-pressed={selected}
        className={`relative flex w-full items-center overflow-hidden rounded-xl border-2 py-2.5 pl-4 pr-3 transition enabled:hover:border-emerald-400/70 enabled:active:scale-[0.99] disabled:cursor-default ${state}`}>
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: t.color ?? "transparent" }} />
        <TeamLine {...t} showScore={showScore} win={g.winner === side || (g.state === "in" && leading(g) === side)} />
        {selected && <span className={`ml-2 text-lg font-black ${wrong ? "text-red-600" : "text-emerald-400"}`}>{wrong ? "✗" : "✓"}</span>}
      </button>
    );
  };
  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span>
          {g.state === "in" ? <span className="font-bold text-red-600">● {g.status_detail}</span>
            : g.state === "post" ? <span>{g.status_detail || "Final"}</span>
            : <LocalTime iso={g.kickoff} />}
        </span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          {isTiebreaker && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300">Tiebreaker</span>}
          {locked ? <span>🔒</span> : !pick ? <span className="font-bold text-emerald-400">Pick by kickoff</span> : null}
        </span>
      </div>
      {btn("away")}
      {btn("home")}
    </div>
  );
}

function TiebreakerBox({ contest, userId, locked, game, value }: {
  contest: Contest; userId: string; locked: boolean; game?: Game; value?: number;
}) {
  const [v, setV] = useState(value?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setV(value?.toString() ?? ""), [value]);
  if (!game) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return setMsg("Enter a whole number.");
    const { error } = await createClient().from("tiebreakers")
      .upsert({ user_id: userId, contest_id: contest.id, total_points: n }, { onConflict: "user_id,contest_id" });
    setMsg(error ? "Couldn't save. The tiebreaker locks at the first kickoff." : "Saved ✓");
  }
  return (
    <form onSubmit={save} className="card flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor="tb">Tiebreaker: total points in {game.away_abbr} at {game.home_abbr}</label>
        <input id="tb" type="number" min={0} inputMode="numeric" className="input" disabled={locked}
          value={v} onChange={(e) => { setV(e.target.value); setMsg(null); }} placeholder="e.g. 45" />
      </div>
      {!locked && <button className="btn-primary">Save</button>}
      {msg && <span className="text-sm text-slate-500">{msg}</span>}
      {locked && <span className="text-sm text-slate-500">🔒 Locked at first kickoff</span>}
    </form>
  );
}

function Board({ games, picks, standings, userId, contest, payments, tiebreakers }: {
  games: Game[]; picks: Pick[]; standings: StandingRow[]; userId: string; contest: Contest;
  payments: Payment[]; tiebreakers: Tiebreaker[];
}) {
  const pickMap = new Map(picks.map((x) => [`${x.user_id}:${x.game_id}`, x.side]));
  const payBy = new Map(payments.map((x) => [x.user_id, x]));
  const hasFee = Number(contest.entry_fee) > 0;
  const tbGame = games.find((g) => g.id === contest.tiebreaker_game_id);
  const tbShown = tiebreakers.length > 0;
  const started = games.some((g) => g.state !== "pre" || new Date(g.kickoff).getTime() <= Date.now());
  const anyOpen = games.some((g) => !isLocked(g, contest, started));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold uppercase text-white">Standings</h2>
        {standings.length === 0 && <p className="card text-center text-slate-400">No picks yet.</p>}
        {standings.map((r) => {
          const pay = payBy.get(r.user_id);
          const me = r.user_id === userId;
          return (
            <div key={r.user_id}
              className={`flex items-center gap-3 rounded-2xl border bg-slate-900 px-4 py-3 ${me ? "border-emerald-400 shadow-[0_0_20px_-10px_var(--color-emerald-400)]" : "border-slate-800"}`}>
              <span className={`w-9 font-display text-2xl font-bold ${r.place === 1 ? "text-amber-300" : "text-emerald-400"}`}>
                {r.place === 1 ? "🏆" : r.place}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-white">{r.display_name}</span>
                <span className="block text-xs text-slate-400">
                  Max {r.user_id === userId || !anyOpen ? r.possible : "?"}
                  {tbGame && tbShown && <> · Tiebreak {r.tiebreak ?? "–"}{r.tiebreakDiff !== null && ` (off ${r.tiebreakDiff})`}</>}
                  {hasFee && (
                    <> · {pay?.status === "verified" ? <span className="text-emerald-400">Paid</span>
                      : pay ? <span className="text-amber-300">{METHOD_LABEL[pay.method]} pending</span>
                      : <span className="text-red-400">Unpaid</span>}</>
                  )}
                </span>
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-white">
                {r.correct}<span className="text-slate-500">–</span>{r.wrong}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="text-xs">
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 z-10 bg-slate-800 px-3 py-2 text-left uppercase tracking-wide text-slate-400">Everyone&apos;s picks</th>
              {games.map((g) => (
                <th key={g.id} className="min-w-16 px-2 py-2 text-center font-semibold">
                  <div>{g.away_abbr}</div>
                  <div className="text-slate-400">@{g.home_abbr}</div>
                  <div className={`mt-0.5 font-display text-sm ${g.state === "in" ? "text-red-600" : "text-slate-400"}`}>
                    {g.state === "pre" ? <LocalTime iso={g.kickoff} withDate={false} /> : `${g.away_score ?? 0}-${g.home_score ?? 0}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => (
              <tr key={r.user_id} className={`border-t border-slate-800 ${r.user_id === userId ? "bg-emerald-950/60" : ""}`}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-900 px-3 py-2 font-bold text-white">
                  {r.display_name}
                </td>
                {games.map((g) => {
                  const side = pickMap.get(`${r.user_id}:${g.id}`);
                  const hidden = !side && r.user_id !== userId && isLocked(g, contest, started) === false;
                  const abbr = side === "home" ? g.home_abbr : side === "away" ? g.away_abbr : null;
                  const cls = !side ? "text-slate-600"
                    : g.state === "post" && g.winner ? (g.winner === side ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400 line-through")
                    : g.state === "in" ? (leading(g) === side ? "text-emerald-400" : leading(g) ? "text-red-400" : "text-slate-200")
                    : "text-slate-200";
                  return (
                    <td key={g.id} className={`px-2 py-2 text-center font-bold ${cls}`}>
                      {abbr ?? (hidden ? "🔒" : "–")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
          Other players&apos; picks show up when each game kicks off. 🔒 means hidden until then.
        </p>
      </div>
    </div>
  );
}

function leading(g: Game): Side | null {
  if (g.home_score === null || g.away_score === null || g.home_score === g.away_score) return null;
  return g.home_score > g.away_score ? "home" : "away";
}
