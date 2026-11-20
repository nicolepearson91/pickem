"use client";

import { useMemo, useState, useTransition } from "react";
import { CFB_GROUPS, type EspnGame } from "@/lib/espn";
import { createContest } from "@/app/admin/actions";
import type { League } from "@/lib/types";
import LocalTime from "./LocalTime";

type Filter = "all" | "ranked" | "top25both";

export default function ContestBuilder({ defaultSeason, defaultWeek }: { defaultSeason: number; defaultWeek: number }) {
  const [league, setLeague] = useState<League>("nfl");
  const [season, setSeason] = useState(defaultSeason);
  const [seasonType, setSeasonType] = useState(2);
  const [week, setWeek] = useState(defaultWeek);
  const [group, setGroup] = useState("80");
  const [games, setGames] = useState<EspnGame[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [name, setName] = useState("");
  const [fee, setFee] = useState("0");
  const [tiebreaker, setTiebreaker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const leagueName = league === "nfl" ? "NFL" : "College";
  const defaultName = `${leagueName} Week ${week}${league === "cfb" && group !== "80" ? ` · ${CFB_GROUPS.find((g) => g.id === group)?.label}` : ""}`;

  async function load() {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ league, season: String(season), seasonType: String(seasonType), week: String(week), group });
    const res = await fetch(`/api/espn?${q}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) return setError(body.error ?? "Couldn't load games.");
    const list: EspnGame[] = body.games;
    setGames(list);
    setFilter("all");
    applyFilter(list, "all");
    setName("");
  }

  function applyFilter(list: EspnGame[], f: Filter) {
    const keep = list.filter((g) =>
      f === "all" ? true : f === "ranked" ? g.home.rank || g.away.rank : g.home.rank && g.away.rank,
    );
    setPicked(new Set(keep.map((g) => g.espn_id)));
    const last = keep[keep.length - 1];
    setTiebreaker(last ? last.espn_id : null);
  }

  const chosen = useMemo(() => (games ?? []).filter((g) => picked.has(g.espn_id)), [games, picked]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function publish() {
    setError(null);
    startSave(async () => {
      const res = await createContest({
        name: name.trim() || defaultName,
        league, season, seasonType, week,
        group: league === "cfb" ? group : null,
        entryFee: Number(fee) || 0,
        espnIds: chosen.map((g) => g.espn_id),
        tiebreakerEspnId: tiebreaker && picked.has(tiebreaker) ? tiebreaker : null,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">New pick em</h1>

      <section className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <span className="label">League</span>
          <div className="flex gap-1">
            {(["nfl", "cfb"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLeague(l); setGames(null); }}
                className={`btn flex-1 ${league === l ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-ghost"}`}>
                {l === "nfl" ? "NFL" : "College"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="season">Season</label>
          <input id="season" type="number" className="input" value={season} onChange={(e) => setSeason(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="stype">Part of season</label>
          <select id="stype" className="input" value={seasonType} onChange={(e) => setSeasonType(Number(e.target.value))}>
            <option value={2}>Regular season</option>
            <option value={3}>{league === "nfl" ? "Playoffs" : "Bowls & playoff"}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="week">Week</label>
          <input id="week" type="number" min={1} className="input" value={week} onChange={(e) => setWeek(Number(e.target.value))} />
        </div>
        {league === "cfb" && (
          <div>
            <label className="label" htmlFor="group">Conference</label>
            <select id="group" className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              {CFB_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-end sm:col-span-2 lg:col-span-5">
          <button className="btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Load games"}</button>
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {games && (
        <>
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Choose games ({chosen.length} of {games.length})</h2>
              <div className="flex flex-wrap gap-1 text-sm">
                <button className="btn-ghost" onClick={() => { setFilter("all"); applyFilter(games, "all"); }}>All</button>
                <button className="btn-ghost" onClick={() => { setPicked(new Set()); setTiebreaker(null); }}>None</button>
                {league === "cfb" && (
                  <>
                    <button className={`btn-ghost ${filter === "ranked" ? "ring-2 ring-emerald-500" : ""}`}
                      onClick={() => { setFilter("ranked"); applyFilter(games, "ranked"); }}>Any Top 25 team</button>
                    <button className={`btn-ghost ${filter === "top25both" ? "ring-2 ring-emerald-500" : ""}`}
                      onClick={() => { setFilter("top25both"); applyFilter(games, "top25both"); }}>Top 25 vs Top 25</button>
                  </>
                )}
              </div>
            </div>
            {games.length === 0 && <p className="text-sm text-slate-500">ESPN has no games for that week yet.</p>}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {games.map((g) => (
                <li key={g.espn_id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={picked.has(g.espn_id)}
                    onChange={() => toggle(g.espn_id)} aria-label={`${g.away.name} at ${g.home.name}`} />
                  <span className="flex-1 text-sm">
                    {g.away.rank && <span className="text-xs text-slate-500">{g.away.rank} </span>}
                    <span className="font-semibold">{g.away.name}</span> at{" "}
                    {g.home.rank && <span className="text-xs text-slate-500">{g.home.rank} </span>}
                    <span className="font-semibold">{g.home.name}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {g.state === "pre" ? <LocalTime iso={g.kickoff} /> : g.status_detail}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input" placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="fee">Entry fee ($)</label>
              <input id="fee" type="number" min={0} step="1" className="input" value={fee} onChange={(e) => setFee(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">0 means free. Over 0 shows the payment options.</p>
            </div>
            <div>
              <label className="label" htmlFor="tb">Tiebreaker game (guess total points)</label>
              <select id="tb" className="input" value={tiebreaker ?? ""} onChange={(e) => setTiebreaker(e.target.value || null)}>
                <option value="">No tiebreaker</option>
                {chosen.map((g) => <option key={g.espn_id} value={g.espn_id}>{g.away.abbr} at {g.home.abbr}</option>)}
              </select>
            </div>
            <div className="sm:col-span-3">
              <button className="btn-primary" disabled={saving || chosen.length === 0} onClick={publish}>
                {saving ? "Publishing…" : `Publish pick em with ${chosen.length} games`}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
