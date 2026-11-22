"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearNumbers, drawNumbers, linkGame, saveScores, setSquare, switchToLiveScores, updateBoard, type GameRef,
} from "@/app/admin/squares/actions";
import { QUARTERS, teamLabel, type Square, type SquaresBoard } from "@/lib/squares";
import GamePicker from "./GamePicker";
import SquaresGrid from "./SquaresGrid";

type R = { ok: true; message?: string } | { ok: false; error: string } | void;

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<R>) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (r && !r.ok) setMsg({ ok: false, text: r.error });
    else if (r && r.message) setMsg({ ok: true, text: r.message });
    router.refresh();
  });
  const note = msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-amber-300"}`}>{msg.text}</p>;
  return { pending, run, note };
}

export function BoardSettings({ board }: { board: SquaresBoard }) {
  const { pending, run, note } = useAction();
  return (
    <form className="card grid gap-3 sm:grid-cols-3" action={(fd) => run(() => updateBoard(board.id, fd))}>
      <h2 className="text-lg font-bold sm:col-span-3">Board settings</h2>
      <div>
        <label className="label" htmlFor="bs-name">Name</label>
        <input id="bs-name" name="name" className="input" defaultValue={board.name} />
      </div>
      <div>
        <label className="label" htmlFor="bs-price">Price per square ($)</label>
        <input id="bs-price" name="price" type="number" min={0} step="0.01" className="input" defaultValue={Number(board.price)} />
      </div>
      <div>
        <label className="label" htmlFor="bs-max">Most squares per person</label>
        <input id="bs-max" name="max" type="number" min={1} max={100} className="input" placeholder="No limit" defaultValue={board.max_per_player ?? ""} />
      </div>
      <div className="sm:col-span-3">
        <span className="label">Payouts (% of the pot, must add up to 100)</span>
        <div className="grid grid-cols-4 gap-2">
          {(["q1", "q2", "q3", "final"] as const).map((k, i) => (
            <div key={k}>
              <label className="block text-xs text-slate-400" htmlFor={`bs-${k}`}>{QUARTERS[i]}</label>
              <input id={`bs-${k}`} name={k} type="number" min={0} max={100} className="input" defaultValue={board[`${k}_pct`]} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button className="btn-primary" disabled={pending}>Save settings</button>
        {note}
      </div>
      <p className="text-xs text-slate-500 sm:col-span-3">Changing the price doesn&apos;t change what players already paid. Lowering the limit doesn&apos;t take away squares people already have.</p>
    </form>
  );
}

export function BoardGame({ board, season }: { board: SquaresBoard; season: number }) {
  const { pending, run, note } = useAction();
  const [ref, setRef] = useState<GameRef | null>(null);
  const [open, setOpen] = useState(!board.espn_id);
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Game</h2>
          <p className="text-sm text-slate-400">
            {board.espn_id ? <>Linked: <strong className="text-white">{teamLabel(board, "away")} at {teamLabel(board, "home")}</strong>. {teamLabel(board, "home")} runs across the top, {teamLabel(board, "away")} down the side.</>
              : "No game linked yet. Link it once ESPN lists the matchup (for the Super Bowl, after the conference title games in late January)."}
          </p>
        </div>
        {board.espn_id && !open && <button className="btn-ghost" onClick={() => setOpen(true)}>Change game</button>}
      </div>
      {open && (
        <>
          <GamePicker season={season} value={ref} onChange={(g) => setRef(g)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={pending || !ref} onClick={() => run(() => linkGame(board.id, ref))}>Link this game</button>
            {board.espn_id && <button className="btn-ghost" disabled={pending} onClick={() => run(() => linkGame(board.id, null))}>Unlink</button>}
          </div>
        </>
      )}
      {note}
    </section>
  );
}

export function BoardNumbers({ board, taken }: { board: SquaresBoard; taken: number }) {
  const { pending, run, note } = useAction();
  const [sure, setSure] = useState(false);
  const drawn = !!board.col_digits;
  return (
    <section className="card space-y-2">
      <h2 className="text-lg font-bold">Numbers</h2>
      {drawn ? (
        <p className="text-sm text-slate-400">
          Drawn. Across the top: <strong className="text-white">{board.col_digits!.join(" ")}</strong>. Down the side: <strong className="text-white">{board.row_digits!.join(" ")}</strong>.
          {" "}The board is locked, so players can&apos;t change squares now.
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          {taken} of 100 squares taken. The numbers draw on their own when the 100th square is claimed. Drawing them now locks the board,
          and any empty squares stay empty (if one wins, that prize rolls to the next quarter).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!drawn && (!sure && taken < 100
          ? <button className="btn-ghost" onClick={() => setSure(true)}>Draw numbers now</button>
          : <button className="btn-primary" disabled={pending} onClick={() => run(() => drawNumbers(board.id))}>
              {taken < 100 ? `Yes, draw with ${100 - taken} empty` : "Draw numbers"}
            </button>)}
        {drawn && board.state === "pre" && (
          <button className="btn-ghost" disabled={pending} onClick={() => run(() => clearNumbers(board.id))}>Clear numbers and unlock</button>
        )}
      </div>
      {note}
    </section>
  );
}

export function BoardScores({ board }: { board: SquaresBoard }) {
  const { pending, run, note } = useAction();
  const marks = Array.isArray(board.marks) ? board.marks : [];
  return (
    <form className="card space-y-3" action={(fd) => run(() => saveScores(board.id, fd))}>
      <div>
        <h2 className="text-lg font-bold">Quarter scores</h2>
        <p className="text-sm text-slate-400">
          {board.manual_scores ? "You typed these in, so live updates leave them alone."
            : board.espn_id ? "These fill in from live scores as each quarter ends. Fix one here if it's ever wrong."
            : "No game is linked, so type the score at the end of each quarter here."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUARTERS.map((q, i) => (
          <div key={q}>
            <span className="label">{q}</span>
            <div className="flex items-center gap-1">
              <input name={`a${i}`} type="number" min={0} inputMode="numeric" aria-label={`${teamLabel(board, "away")} score, ${q}`} className="input px-2"
                placeholder={board.away_abbr ?? "Away"} defaultValue={marks[i]?.away ?? ""} />
              <span className="text-slate-500">–</span>
              <input name={`h${i}`} type="number" min={0} inputMode="numeric" aria-label={`${teamLabel(board, "home")} score, ${q}`} className="input px-2"
                placeholder={board.home_abbr ?? "Home"} defaultValue={marks[i]?.home ?? ""} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{teamLabel(board, "away")} first, then {teamLabel(board, "home")}. Use the total score at that point, not just that quarter&apos;s points.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={pending}>Save scores</button>
        {board.manual_scores && board.espn_id && (
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => switchToLiveScores(board.id))}>Go back to live scores</button>
        )}
        {note}
      </div>
    </form>
  );
}

export function BoardAssign({ board, squares, players, adminId }: {
  board: SquaresBoard; squares: Square[]; players: { id: string; name: string }[]; adminId: string;
}) {
  const { pending, run, note } = useAction();
  const [to, setTo] = useState<string>("");
  const names = new Map(players.map((p) => [p.id, p.name]));
  const tap = (row: number, col: number) => {
    if (pending) return;
    const who = squares.find((s) => s.row_idx === row && s.col_idx === col)?.user_id;
    if (who) run(() => setSquare(board.id, row, col, null));
    else if (to) run(() => setSquare(board.id, row, col, to));
  };
  return (
    <section className="space-y-2">
      <div className="card space-y-2">
        <h2 className="text-lg font-bold">Fill in squares for people</h2>
        <p className="text-sm text-slate-400">Pick a player, then tap empty squares to put them in that person&apos;s name. Tap a taken square to empty it. This works even after the numbers are drawn, so use it carefully.</p>
        <select className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Give squares to">
          <option value="">Choose a player…</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {note}
      </div>
      <SquaresGrid board={board} squares={squares} names={names} userId={adminId} onTap={tap} highlightUser={to || null} />
    </section>
  );
}
