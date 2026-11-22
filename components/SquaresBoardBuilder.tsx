"use client";

import { useState, useTransition } from "react";
import { createBoards, type GameRef } from "@/app/admin/squares/actions";
import GamePicker from "./GamePicker";

export default function SquaresBoardBuilder({ season }: { season: number }) {
  const [name, setName] = useState("Super Bowl Squares");
  const [prices, setPrices] = useState("5, 10, 20");
  const [max, setMax] = useState("");
  const [p, setP] = useState(["20", "20", "20", "40"]);
  const [game, setGame] = useState<GameRef | null>(null);
  const [gameLabel, setGameLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const priceList = prices.split(/[,\s]+/).map((x) => x.replace(/^\$/, "")).filter(Boolean).map(Number);
  const total = p.reduce((s, x) => s + (Number(x) || 0), 0);

  function save() {
    setError(null);
    start(async () => {
      const r = await createBoards({ name, prices: priceList, maxPerPlayer: Number(max) || null, pcts: p.map(Number), game });
      if (r && !r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">New squares board</h1>

      <section className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="sb-name">Name</label>
          <input id="sb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sb-prices">Price per square ($)</label>
          <input id="sb-prices" className="input" value={prices} onChange={(e) => setPrices(e.target.value)} inputMode="decimal" />
          <p className="mt-1 text-xs text-slate-500">Put more than one price, like &quot;5, 10, 20&quot;, to make a separate board for each.</p>
        </div>
        <div>
          <label className="label" htmlFor="sb-max">Most squares per person</label>
          <input id="sb-max" type="number" min={1} max={100} className="input" placeholder="No limit" value={max} onChange={(e) => setMax(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">Leave empty for no limit. You can change it later.</p>
        </div>
        <div className="sm:col-span-3">
          <span className="label">Payouts (% of the pot)</span>
          <div className="grid grid-cols-4 gap-2">
            {["1st quarter", "Halftime", "3rd quarter", "Final"].map((l, i) => (
              <div key={l}>
                <label className="block text-xs text-slate-400" htmlFor={`sb-p${i}`}>{l}</label>
                <input id={`sb-p${i}`} type="number" min={0} max={100} className="input" value={p[i]}
                  onChange={(e) => setP((x) => x.map((v, j) => (j === i ? e.target.value : v)))} />
              </div>
            ))}
          </div>
          <p className={`mt-1 text-xs ${total === 100 ? "text-slate-500" : "text-amber-300"}`}>Adds up to {total}%{total !== 100 && " (needs to be 100%)"}</p>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">Game {gameLabel && <span className="text-emerald-400">· {gameLabel}</span>}</h2>
          <p className="text-sm text-slate-500">Linking the game lets the board show live scores and winners on its own. Optional for now: the Super Bowl matchup isn&apos;t set until late January, and you can link it later.</p>
        </div>
        <GamePicker season={season} value={game} onChange={(g, l) => { setGame(g); setGameLabel(l ?? null); }} />
        {game && <button type="button" className="btn-ghost text-xs" onClick={() => { setGame(null); setGameLabel(null); }}>Don&apos;t link a game yet</button>}
      </section>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      <button className="btn-primary" disabled={saving || priceList.length === 0 || total !== 100} onClick={save}>
        {saving ? "Making…" : priceList.length > 1 ? `Make ${priceList.length} boards` : "Make board"}
      </button>
    </div>
  );
}
