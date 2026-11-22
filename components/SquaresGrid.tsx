"use client";

import { Fragment } from "react";
import type { Square, SquaresBoard } from "@/lib/squares";
import { cellFor, teamLabel } from "@/lib/squares";

/** Short label for a square: first name, cut to fit. */
export const shortName = (n: string) => {
  const first = n.trim().split(/\s+/)[0] ?? "";
  return first.length > 6 ? first.slice(0, 5) + "…" : first;
};

export default function SquaresGrid({ board, squares, names, userId, onTap, selected, winners = [], highlightUser }: {
  board: SquaresBoard;
  squares: Square[];
  names: Map<string, string>;
  userId: string;
  onTap?: (row: number, col: number) => void;
  selected?: { row: number; col: number } | null;
  /** Winning squares with a label like "Q1". */
  winners?: { row: number; col: number; label: string; live?: boolean }[];
  /** Outline this player's squares (the admin's "give squares to" pick). */
  highlightUser?: string | null;
}) {
  const owner = new Map(squares.map((s) => [`${s.row_idx}:${s.col_idx}`, s.user_id]));
  const drawn = !!(board.col_digits && board.row_digits);
  const homeColor = board.home_color ?? "#39ff88";
  const awayColor = board.away_color ?? "#fbbf24";
  const liveCell = board.state === "in" && board.home_score !== null && board.away_score !== null
    ? cellFor(board, { home: board.home_score, away: board.away_score }) : null;

  return (
    <div className="card mx-auto max-w-2xl overflow-hidden p-2 sm:p-4">
      <div className="flex items-center justify-center gap-2 pb-1 pl-8 text-sm font-bold uppercase tracking-wide sm:pl-12" style={{ color: lighten(homeColor) }}>
        {board.home_logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={board.home_logo} alt="" className="h-5 w-5 object-contain" />}
        {teamLabel(board, "home")} →
      </div>
      <div className="flex">
        <div className="flex w-6 shrink-0 items-center justify-center sm:w-8">
          <span className="whitespace-nowrap text-sm font-bold uppercase tracking-wide [writing-mode:vertical-rl] rotate-180" style={{ color: lighten(awayColor) }}>
            {teamLabel(board, "away")} →
          </span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-[1.25rem_repeat(10,minmax(0,1fr))] gap-[2px] sm:grid-cols-[2rem_repeat(10,minmax(0,1fr))] sm:gap-1">
          <div />
          {Array.from({ length: 10 }, (_, c) => (
            <div key={c} className="grid h-6 place-items-center rounded font-display text-sm font-bold text-slate-950 sm:h-8 sm:text-lg" style={{ background: lighten(homeColor) }}>
              {drawn ? board.col_digits![c] : "?"}
            </div>
          ))}
          {Array.from({ length: 10 }, (_, r) => <Fragment key={r}>{row(r)}</Fragment>)}
        </div>
      </div>
      {!drawn && <p className="pt-2 text-center text-xs text-slate-400">Numbers are drawn at random once the board fills up, so every square has the same chance.</p>}
    </div>
  );

  function row(r: number) {
    return (
      <>
        <div className="grid place-items-center rounded font-display text-sm font-bold text-slate-950 sm:text-lg" style={{ background: lighten(awayColor) }}>
          {drawn ? board.row_digits![r] : "?"}
        </div>
        {Array.from({ length: 10 }, (_, c) => {
          const who = owner.get(`${r}:${c}`);
          const mine = who === userId;
          const win = winners.filter((w) => w.row === r && w.col === c);
          const isLive = liveCell && liveCell.row === r && liveCell.col === c;
          const isSel = selected && selected.row === r && selected.col === c;
          const hl = highlightUser && who === highlightUser;
          const cls = win.length ? "bg-amber-300 text-slate-950 border-amber-200"
            : mine ? "bg-emerald-400 text-slate-950 border-emerald-300"
            : who ? "bg-slate-700 text-slate-100 border-slate-600"
            : "bg-slate-950 text-slate-600 border-slate-800 hover:border-emerald-400/60";
          return (
            <button key={c} type="button" onClick={() => onTap?.(r, c)} disabled={!onTap}
              aria-label={`Square row ${r + 1} column ${c + 1}: ${who ? names.get(who) ?? "taken" : "open"}`}
              className={`relative grid aspect-square min-w-0 place-items-center overflow-hidden rounded border text-[9px] font-bold leading-none transition sm:rounded-md sm:text-xs ${cls}
                ${isLive ? "animate-pulse ring-2 ring-red-500" : ""} ${isSel ? "ring-2 ring-white" : ""} ${hl ? "outline-2 outline-offset-1 outline-sky-400" : ""}`}>
              <span className="w-full truncate px-[1px] text-center">{who ? shortName(names.get(who) ?? "?") : ""}</span>
              {win.length > 0 && (
                <span className="absolute inset-x-0 top-0 truncate bg-slate-950/80 text-[7px] text-amber-300 sm:text-[9px]">{win.map((w) => w.label).join(" ")}</span>
              )}
            </button>
          );
        })}
      </>
    );
  }
}

/** Team colors can be very dark; lift them so they read on navy. */
function lighten(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 120) {
    const t = Math.min(0.75, (120 - lum) / 160 + 0.35);
    [r, g, b] = [r, g, b].map((v) => Math.round(v + (255 - v) * t));
  }
  return `rgb(${r}, ${g}, ${b})`;
}
