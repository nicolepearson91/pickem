"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { contestStandings, ordinal, type StandingRow } from "@/lib/scoring";
import type { AppSettings, Contest, Game, Payment, Pick, Profile, Side, Tiebreaker } from "@/lib/types";
import LocalTime from "./LocalTime";
import PaymentPanel from "./PaymentPanel";
import { useLiveContest } from "./useLiveContest";
import { METHOD_LABEL } from "@/lib/payments";

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
}

export const isLocked = (g: Game, c: Contest) =>
  c.status !== "open" || g.state !== "pre" || new Date(g.kickoff).getTime() <= Date.now();

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
    if (isLocked(g, contest)) return;
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {contest.league === "nfl" ? "NFL" : "College football"} · {contest.season} · Week {contest.week}
            {contest.status === "closed" && " · Closed"}
          </p>
          <h1 className="text-3xl font-black">{contest.name}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {live && <span className="animate-pulse rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
          {myRow && started && (
            <span className="rounded-lg bg-emerald-100 px-3 py-1 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              You&apos;re {ordinal(myRow.place)} · {myRow.correct}–{myRow.wrong}
            </span>
          )}
        </div>
      </div>

      {Number(contest.entry_fee) > 0 && (
        <PaymentPanel contest={contest} userId={userId} settings={p.settings}
          payment={p.payments.find((x) => x.user_id === userId)} adminName={p.people.find((x) => x.is_admin)?.display_name} />
      )}

      <div className="flex gap-1 rounded-lg bg-slate-200 p-1 text-sm font-semibold dark:bg-slate-800 sm:w-fit">
        {(["picks", "board"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-4 py-1.5 sm:flex-none ${tab === t ? "bg-white shadow dark:bg-slate-950" : "text-slate-600 dark:text-slate-400"}`}>
            {t === "picks" ? `My picks (${pickedCount}/${games.length})` : "Dashboard"}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {tab === "picks" ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {games.map((g) => (
              <GameCard key={g.id} g={g} locked={isLocked(g, contest)} pick={mine[g.id]} onPick={(s) => choose(g, s)}
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

function TeamLine({ name, abbr, logo, rank, score, showScore, win }: {
  name: string; abbr: string; logo: string | null; rank: number | null; score: number | null; showScore: boolean; win: boolean;
}) {
  return (
    <span className="flex w-full items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-7 w-7 shrink-0 object-contain" />
      ) : <span className="h-7 w-7 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700" />}
      <span className="min-w-0 flex-1 truncate text-left">
        {rank && <span className="mr-1 text-xs text-slate-500">{rank}</span>}
        <span className="font-semibold sm:hidden">{abbr}</span>
        <span className="hidden font-semibold sm:inline">{name}</span>
      </span>
      {showScore && <span className={`tabular-nums text-lg ${win ? "font-black" : "font-medium text-slate-500"}`}>{score ?? 0}</span>}
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
      ? { name: g.home_name, abbr: g.home_abbr, logo: g.home_logo, rank: g.home_rank, score: g.home_score }
      : { name: g.away_name, abbr: g.away_abbr, logo: g.away_logo, rank: g.away_rank, score: g.away_score };
    const color = right ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
      : wrong ? "border-red-500 bg-red-50 dark:bg-red-950"
      : selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600 dark:bg-emerald-950"
      : "border-slate-200 dark:border-slate-700";
    return (
      <button type="button" disabled={locked} onClick={() => onPick(side)} aria-pressed={selected}
        className={`flex w-full items-center rounded-lg border-2 px-3 py-2 transition enabled:hover:border-emerald-400 disabled:cursor-default ${color}`}>
        <TeamLine {...t} showScore={showScore} win={g.winner === side} />
        {selected && <span className="ml-2 text-emerald-600">{wrong ? "✗" : "✓"}</span>}
      </button>
    );
  };
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {g.state === "in" ? <span className="font-bold text-red-600">● {g.status_detail}</span>
            : g.state === "post" ? <span className="font-semibold">{g.status_detail || "Final"}</span>
            : <LocalTime iso={g.kickoff} />}
        </span>
        <span className="flex gap-2">
          {isTiebreaker && <span className="rounded bg-amber-100 px-1.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Tiebreaker</span>}
          {locked ? <span>🔒 Locked</span> : !pick ? <span className="font-semibold text-amber-600">Needs a pick</span> : null}
        </span>
      </div>
      {btn("away")}
      <div className="text-center text-[10px] font-bold uppercase text-slate-400">at</div>
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
  const anyOpen = games.some((g) => !isLocked(g, contest));

  return (
    <div className="space-y-5">
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Place</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Right</th>
              <th className="px-3 py-2 text-right">Wrong</th>
              <th className="px-3 py-2 text-right">Max possible</th>
              {tbGame && tbShown && <th className="px-3 py-2 text-right">Tiebreaker</th>}
              {hasFee && <th className="px-3 py-2">Paid</th>}
            </tr>
          </thead>
          <tbody>
            {standings.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No picks yet.</td></tr>
            )}
            {standings.map((r) => {
              const pay = payBy.get(r.user_id);
              return (
                <tr key={r.user_id} className={`border-t border-slate-100 dark:border-slate-800 ${r.user_id === userId ? "bg-emerald-50/60 dark:bg-emerald-950/40" : ""}`}>
                  <td className="px-3 py-2 font-black">{r.place === 1 ? "🏆 1st" : ordinal(r.place)}</td>
                  <td className="px-3 py-2 font-semibold">{r.display_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{r.correct}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.wrong}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {/* Other players' unstarted picks are hidden, so their ceiling isn't known yet. */}
                    {r.user_id === userId || !anyOpen ? r.possible : "–"}
                  </td>
                  {tbGame && tbShown && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.tiebreak ?? "–"}{r.tiebreakDiff !== null && <span className="text-xs text-slate-500"> (off {r.tiebreakDiff})</span>}
                    </td>
                  )}
                  {hasFee && (
                    <td className="px-3 py-2">
                      {pay?.status === "verified" ? <span className="text-emerald-600">✓</span>
                        : pay ? <span className="text-xs text-amber-600">{METHOD_LABEL[pay.method]} pending</span>
                        : <span className="text-xs text-red-600">Unpaid</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left uppercase tracking-wide text-slate-500 dark:bg-slate-800">Everyone&apos;s picks</th>
              {games.map((g) => (
                <th key={g.id} className="min-w-16 px-2 py-2 text-center font-semibold">
                  <div>{g.away_abbr}</div>
                  <div className="text-slate-400">@{g.home_abbr}</div>
                  <div className={`mt-0.5 font-normal ${g.state === "in" ? "text-red-600" : "text-slate-500"}`}>
                    {g.state === "pre" ? <LocalTime iso={g.kickoff} withDate={false} /> : `${g.away_score ?? 0}-${g.home_score ?? 0}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => (
              <tr key={r.user_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-semibold dark:bg-slate-900">
                  {r.display_name}
                </td>
                {games.map((g) => {
                  const side = pickMap.get(`${r.user_id}:${g.id}`);
                  const hidden = !side && r.user_id !== userId && isLocked(g, contest) === false;
                  const abbr = side === "home" ? g.home_abbr : side === "away" ? g.away_abbr : null;
                  const cls = !side ? "text-slate-300 dark:text-slate-600"
                    : g.state === "post" && g.winner ? (g.winner === side ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-red-100 text-red-700 line-through dark:bg-red-950 dark:text-red-300")
                    : g.state === "in" ? (leading(g) === side ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : leading(g) ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300" : "")
                    : "";
                  return (
                    <td key={g.id} className={`px-2 py-1.5 text-center font-semibold ${cls}`}>
                      {abbr ?? (hidden ? "🔒" : "–")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
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
