import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { contestStandings, ordinal, seasonStandings } from "@/lib/scoring";
import type { Contest, Game, League, Pick, Profile, Tiebreaker } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ league?: string; season?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireMember();
  const league: League = sp.league === "cfb" ? "cfb" : "nfl";

  const { data: seasonsRaw } = await supabase.from("contests").select("season").eq("league", league);
  const seasons = [...new Set((seasonsRaw ?? []).map((r) => r.season as number))].sort((a, b) => b - a);
  const season = Number(sp.season) || seasons[0] || new Date().getFullYear();

  const { data: contests } = await supabase.from("contests").select("*, games!games_contest_id_fkey(*)")
    .eq("league", league).eq("season", season).order("week");
  const list = (contests ?? []) as (Contest & { games: Game[] })[];
  const ids = list.map((c) => c.id);
  const [{ data: picks }, { data: tbs }, { data: people }] = await Promise.all([
    ids.length ? supabase.from("picks").select("user_id, game_id, contest_id, side").in("contest_id", ids) : { data: [] },
    ids.length ? supabase.from("tiebreakers").select("*").in("contest_id", ids) : { data: [] },
    supabase.from("profiles").select("id, display_name, is_admin, is_member"),
  ]);

  const weeks = list.map((c) => ({
    contest: c,
    finished: c.games.length > 0 && c.games.every((g) => g.state === "post"),
    rows: contestStandings(
      (people ?? []) as Profile[], c.games,
      ((picks ?? []) as Pick[]).filter((p) => p.contest_id === c.id),
      ((tbs ?? []) as Tiebreaker[]).filter((t) => t.contest_id === c.id),
      c.tiebreaker_game_id,
    ),
  }));
  const table = seasonStandings(weeks);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-black">Season standings</h1>
        <div className="flex flex-wrap gap-1">
          {(["nfl", "cfb"] as const).map((l) => (
            <Link key={l} href={`/standings?league=${l}`}
              className={`btn ${league === l ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-ghost"}`}>
              {l === "nfl" ? "NFL" : "College"}
            </Link>
          ))}
          {seasons.length > 1 && seasons.map((s) => (
            <Link key={s} href={`/standings?league=${league}&season=${s}`}
              className={`btn ${s === season ? "ring-2 ring-emerald-500" : ""} btn-ghost`}>{s}</Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Place</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Right</th>
              <th className="px-3 py-2 text-right">Wrong</th>
              <th className="px-3 py-2 text-right">Win %</th>
              <th className="px-3 py-2 text-right">Weeks won</th>
              {weeks.map((w) => (
                <th key={w.contest.id} className="px-2 py-2 text-right">
                  <Link href={`/contests/${w.contest.id}`} className="hover:underline">Wk {w.contest.week}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No results yet for {season}.</td></tr>
            )}
            {table.map((r) => (
              <tr key={r.user_id} className={`border-t border-slate-100 dark:border-slate-800 ${r.user_id === user.id ? "bg-emerald-50/60 dark:bg-emerald-950/40" : ""}`}>
                <td className="px-3 py-2 font-black">{r.place === 1 ? "🏆 1st" : ordinal(r.place)}</td>
                <td className="px-3 py-2 font-semibold">{r.display_name}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{r.correct}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{r.wrong}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.correct + r.wrong ? `${Math.round((r.correct / (r.correct + r.wrong)) * 100)}%` : "–"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.weeksWon}</td>
                {weeks.map((w) => {
                  const row = w.rows.find((x) => x.user_id === r.user_id);
                  return (
                    <td key={w.contest.id} className={`px-2 py-2 text-right tabular-nums ${row?.place === 1 && w.finished ? "font-black text-amber-600" : "text-slate-500"}`}>
                      {row ? row.correct : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Ranked by total correct picks, then weeks won. A week counts as won once all its games are final.</p>
    </div>
  );
}
