"use client";

import { useState } from "react";
import { CFB_GROUPS, type EspnGame } from "@/lib/espn";
import type { League } from "@/lib/types";
import type { GameRef } from "@/app/admin/squares/actions";
import LocalTime from "./LocalTime";

/** Finds one game on ESPN. Defaults to the Super Bowl (NFL playoffs, week 5). */
export default function GamePicker({ season: defaultSeason, value, onChange }: {
  season: number; value: GameRef | null; onChange: (g: GameRef | null, label?: string) => void;
}) {
  const [league, setLeague] = useState<League>("nfl");
  const [season, setSeason] = useState(defaultSeason);
  const [seasonType, setSeasonType] = useState(3);
  const [week, setWeek] = useState(5);
  const [group, setGroup] = useState("80");
  const [games, setGames] = useState<EspnGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ league, season: String(season), seasonType: String(seasonType), week: String(week), group });
    const res = await fetch(`/api/espn?${q}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) return setError(body.error ?? "Couldn't load games.");
    setGames(body.games);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="label">League</span>
          <div className="flex gap-1">
            {(["nfl", "cfb"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLeague(l); setGames(null); if (l === "cfb") { setSeasonType(2); setWeek(1); } else { setSeasonType(3); setWeek(5); } }}
                className={`btn flex-1 ${league === l ? "bg-white text-slate-900" : "btn-ghost"}`}>
                {l === "nfl" ? "NFL" : "College"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="gp-season">Season</label>
          <input id="gp-season" type="number" className="input" value={season} onChange={(e) => setSeason(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="gp-type">Part of season</label>
          <select id="gp-type" className="input" value={seasonType} onChange={(e) => setSeasonType(Number(e.target.value))}>
            <option value={2}>Regular season</option>
            <option value={3}>{league === "nfl" ? "Playoffs" : "Bowls & playoff"}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="gp-week">Week</label>
          <input id="gp-week" type="number" min={1} className="input" value={week} onChange={(e) => setWeek(Number(e.target.value))} />
          {league === "nfl" && seasonType === 3 && <p className="mt-1 text-xs text-slate-500">Week 5 is the Super Bowl.</p>}
        </div>
        {league === "cfb" && (
          <div>
            <label className="label" htmlFor="gp-group">Conference</label>
            <select id="gp-group" className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              {CFB_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <button type="button" className="btn-ghost" onClick={load} disabled={loading}>{loading ? "Loading…" : "Find games"}</button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {games && games.length === 0 && (
        <p className="text-sm text-amber-300">ESPN hasn&apos;t posted a game for that week yet. You can make the board now and link the game later from its Admin page.</p>
      )}
      {games && games.length > 0 && (
        <ul className="divide-y divide-slate-800">
          {games.map((g) => {
            const ref: GameRef = { league, season, seasonType, week, group: league === "cfb" ? group : null, espnId: g.espn_id };
            const on = value?.espnId === g.espn_id;
            return (
              <li key={g.espn_id}>
                <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="radio" name="gp-game" className="h-5 w-5 accent-emerald-500" checked={on}
                    onChange={() => onChange(ref, `${g.away.name} at ${g.home.name}`)} />
                  <span className="flex-1"><strong>{g.away.name}</strong> at <strong>{g.home.name}</strong></span>
                  <span className="text-xs text-slate-500">{g.state === "pre" ? <LocalTime iso={g.kickoff} /> : g.status_detail}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
