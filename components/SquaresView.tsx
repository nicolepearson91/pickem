"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cashAppLink, METHOD_LABEL, money, venmoLink } from "@/lib/payments";
import {
  cellFor, pcts, QUARTER_SHORT, QUARTERS, squaresPot, squaresResults, teamLabel,
  type Square, type SquaresBoard, type SquaresPayment, type SquaresPayout,
} from "@/lib/squares";
import type { AppSettings, PayMethod, PayoutInfo, Profile } from "@/lib/types";
import { notifySquaresPaymentClaimed } from "@/app/notifications/actions";
import { setSquaresPaidOut } from "@/app/admin/squares/actions";
import SquaresGrid from "./SquaresGrid";
import LocalTime from "./LocalTime";
import { useLiveBoard } from "./useLiveBoard";

interface Props {
  me: Profile;
  userId: string;
  board: SquaresBoard;
  squares: Square[];
  payments: SquaresPayment[];
  payouts: SquaresPayout[];
  people: Profile[];
  settings: AppSettings;
  payoutInfo: PayoutInfo[];
}

export default function SquaresView(p: Props) {
  const { board, userId } = p;
  useLiveBoard(board.id, board);
  const router = useRouter();
  const names = useMemo(() => new Map(p.people.map((x) => [x.id, x.display_name])), [p.people]);

  // Squares, updated right away when you tap and re-synced whenever the server sends new data.
  const [squares, setSquares] = useState(p.squares);
  useEffect(() => setSquares(p.squares), [p.squares]);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const drawn = !!(board.col_digits && board.row_digits);
  const canPick = board.status === "open" && !drawn;
  const mine = squares.filter((s) => s.user_id === userId);
  const limit = board.max_per_player;
  const price = Number(board.price);
  const pot = squaresPot(p.payments, price);
  const results = squaresResults(board, squares, pot.pot);
  const split = pcts(board);
  const taken = squares.length;

  async function tap(row: number, col: number) {
    setMsg(null);
    setSelected({ row, col });
    const who = squares.find((s) => s.row_idx === row && s.col_idx === col)?.user_id;
    if (!canPick) return;
    const db = createClient();
    if (who === userId) {
      setSquares((list) => list.filter((s) => !(s.row_idx === row && s.col_idx === col)));
      const { error } = await db.from("squares").delete().eq("board_id", board.id).eq("row_idx", row).eq("col_idx", col).eq("user_id", userId);
      if (error) { setMsg("Couldn't give that square back. The board may have just locked."); router.refresh(); }
      return;
    }
    if (who) return;
    if (limit && mine.length >= limit) return setMsg(`You have the most squares allowed on this board (${limit}). Tap one of yours to give it back.`);
    const sq = { board_id: board.id, row_idx: row, col_idx: col, user_id: userId };
    setSquares((list) => [...list, sq]);
    const { error } = await db.from("squares").insert(sq);
    if (error) {
      setSquares((list) => list.filter((s) => !(s.row_idx === row && s.col_idx === col && s.user_id === userId)));
      setMsg(/duplicate|unique/i.test(error.message) ? "Someone just grabbed that square. Pick another." : "That square didn't save. The board may have just locked or hit your limit.");
      router.refresh();
    }
  }

  const sel = selected ? squares.find((s) => s.row_idx === selected.row && s.col_idx === selected.col) : undefined;
  const winCells = results.flatMap((r) => (r.cell ? [{ ...r.cell, label: QUARTER_SHORT[r.quarter] }] : []));
  const liveCell = board.state === "in" && board.home_score !== null && board.away_score !== null
    ? cellFor(board, { home: board.home_score, away: board.away_score }) : null;
  const liveOwner = liveCell ? squares.find((s) => s.row_idx === liveCell.row && s.col_idx === liveCell.col)?.user_id : undefined;

  // Who holds squares, most first.
  const holders = [...squares.reduce((m, s) => m.set(s.user_id, (m.get(s.user_id) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? ""));
  const payBy = new Map(p.payments.map((x) => [x.user_id, x]));

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-[radial-gradient(120%_120%_at_0%_0%,#163a80_0%,#0f1730_55%,#0b1020_100%)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
          Squares · {money(price)} a square{limit ? ` · up to ${limit} each` : ""}{board.status === "closed" && " · Closed"}
        </p>
        <h1 className="mt-1 text-4xl font-bold leading-none text-white sm:text-5xl">{board.name}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {board.espn_id
            ? <>{teamLabel(board, "away")} at {teamLabel(board, "home")}{board.kickoff && board.state === "pre" && <> · <LocalTime iso={board.kickoff} /></>}</>
            : "Teams to be announced"}
        </p>
        {board.state !== "pre" && board.home_score !== null && (
          <p className="mt-2 flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-white">
            {board.away_abbr} {board.away_score} <span className="text-slate-500">–</span> {board.home_abbr} {board.home_score}
            <span className={`rounded-full px-3 py-1 font-sans text-xs ${board.state === "in" ? "bg-red-600 text-white" : "bg-slate-700 text-slate-200"}`}>
              {board.state === "in" ? `● ${board.status_detail ?? "LIVE"}` : board.status_detail || "Final"}
            </span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          {price > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Pot</p>
              <p className="font-display text-4xl font-bold leading-none text-amber-300 tabular-nums">{money(pot.pot)}</p>
            </div>
          )}
          <p className="pb-1 text-sm text-slate-400">
            {taken} of 100 squares taken{mine.length > 0 && <> · <span className="font-semibold text-emerald-400">you have {mine.length}</span></>}
            {pot.pendingSquares > 0 && <> · <span className="text-amber-300">{money(pot.pendingAmount)} pending</span></>}
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Pays {QUARTER_SHORT.map((q, i) => `${q} ${split[i]}%`).join(" · ")}
        </p>
      </div>

      {drawn && <Results board={board} results={results} names={names} payouts={p.payouts} info={p.payoutInfo}
        isAdmin={p.me.is_admin} userId={userId} liveOwner={liveOwner} liveCell={!!liveCell} />}

      {price > 0 && mine.length > 0 && (
        <SquaresPaymentPanel board={board} userId={userId} count={mine.length} settings={p.settings}
          payment={payBy.get(userId)} adminName={p.people.find((x) => x.is_admin)?.display_name} />
      )}

      <div className="space-y-2">
        <p className="text-sm text-slate-300">
          {canPick
            ? <>Tap an empty square to claim it. Tap one of yours (green) to give it back.</>
            : drawn ? <>Numbers are drawn, so the board is locked. The last digit of each team&apos;s score picks the winning square.</>
            : <>This board is closed.</>}
        </p>
        <SquaresGrid board={board} squares={squares} names={names} userId={userId} onTap={tap} selected={selected} winners={winCells} />
        {msg && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}
        {selected && (
          <p className="text-sm text-slate-400">
            {drawn ? <>That square is {board.away_abbr ?? "away"} <strong className="text-white">{board.row_digits![selected.row]}</strong>, {board.home_abbr ?? "home"} <strong className="text-white">{board.col_digits![selected.col]}</strong> · </> : null}
            {sel ? <>Owned by <strong className="text-white">{names.get(sel.user_id) ?? "someone"}</strong></> : "Open"}
          </p>
        )}
      </div>

      {holders.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-display text-xl font-bold uppercase text-white">Who&apos;s in</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {holders.map(([id, n]) => {
              const pay = payBy.get(id);
              const paid = pay?.verified_squares ?? 0;
              return (
                <li key={id} className="flex items-center justify-between gap-2 border-b border-slate-800/70 py-1.5">
                  <span className={id === userId ? "font-bold text-emerald-400" : "font-semibold text-white"}>{names.get(id) ?? "Someone"}</span>
                  <span className="text-slate-400">
                    {n} square{n === 1 ? "" : "s"}
                    {price > 0 && (paid >= n ? <span className="ml-2 text-emerald-400">Paid</span>
                      : pay?.status === "pending" ? <span className="ml-2 text-amber-300">{METHOD_LABEL[pay.method]} pending</span>
                      : <span className="ml-2 text-red-400">{paid > 0 ? `${n - paid} unpaid` : "Unpaid"}</span>)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const PAYOUT_METHOD: Record<string, string> = { venmo: "Venmo", cashapp: "Cash App", applecash: "Apple Cash", cash: "Cash" };

function Results({ board, results, names, payouts, info, isAdmin, userId, liveOwner, liveCell }: {
  board: SquaresBoard; results: ReturnType<typeof squaresResults>; names: Map<string, string>; payouts: SquaresPayout[];
  info: PayoutInfo[]; isAdmin: boolean; userId: string; liveOwner?: string; liveCell: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paidBy = new Map(payouts.map((x) => [`${x.quarter}:${x.user_id}`, x]));
  const infoBy = new Map(info.map((i) => [i.user_id, i]));
  const mark = (q: number, uid: string, amount: number, method: string | null, paid: boolean) => start(async () => {
    setError(null);
    const r = await setSquaresPaidOut(board.id, q, uid, amount, method, paid);
    if (!r.ok) setError(r.error);
  });
  const myWin = results.some((r) => r.winners.some((w) => w.user_id === userId && !paidBy.has(`${r.quarter}:${userId}`)));
  const myInfo = infoBy.get(userId);

  return (
    <section className="space-y-3 rounded-3xl border border-amber-400/60 bg-slate-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase text-amber-300">🏆 Winners</h2>
        {liveCell && (
          <p className="text-sm text-slate-300">
            Winning right now: <strong className="text-white">{liveOwner ? names.get(liveOwner) ?? "someone" : "an empty square"}</strong>
          </p>
        )}
      </div>
      <ul className="divide-y divide-slate-800">
        {results.map((r) => (
          <li key={r.quarter} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <span className="font-bold text-white">{QUARTERS[r.quarter]}</span>
              {r.mark && (
                <span className="ml-2 text-sm text-slate-400">
                  {board.away_abbr ?? "Away"} {r.mark.away} – {board.home_abbr ?? "Home"} {r.mark.home}
                </span>
              )}
              <span className="block text-sm">
                {!r.mark ? <span className="text-slate-500">Not played yet · {money(r.amount)}{r.rolledIn > 0 && ` (includes ${money(r.rolledIn)} rolled over)`}</span>
                  : r.rolledOver ? <span className="text-amber-300">Nobody had that square, so {money(r.amount)} {r.quarter < 3 ? "rolls to the next quarter" : "is shared by the earlier winners"}</span>
                  : <>
                      <strong className={r.userId === userId ? "text-emerald-400" : "text-white"}>{names.get(r.userId!) ?? "Someone"}</strong>
                      <span className="ml-2 font-display text-lg font-bold text-amber-300">{money(r.winners[0]?.amount ?? r.amount)}</span>
                      {r.rolledIn > 0 && <span className="ml-1 text-xs text-slate-400">(incl. {money(r.rolledIn)} rolled over)</span>}
                      {r.bonus > 0 && <span className="ml-1 text-xs text-slate-400">(incl. {money(r.bonus)} from the empty final square)</span>}
                    </>}
              </span>
            </span>
            {r.winners.map((w) => {
              const paid = paidBy.get(`${r.quarter}:${w.user_id}`);
              const i = infoBy.get(w.user_id);
              const note = `${board.name} ${QUARTERS[r.quarter]} winnings`;
              const sel = `sqm-${r.quarter}-${w.user_id}`;
              return (
                <span key={w.user_id} className="flex flex-wrap items-center gap-2 text-sm">
                  {paid ? (
                    <>
                      <span className="font-semibold text-emerald-400">✓ Paid out{paid.method ? ` · ${PAYOUT_METHOD[paid.method] ?? paid.method}` : ""}</span>
                      {isAdmin && <button className="btn-ghost text-xs" disabled={pending} onClick={() => mark(r.quarter, w.user_id, w.amount, null, false)}>Undo</button>}
                    </>
                  ) : isAdmin && w.amount > 0 ? (
                    <>
                      {i?.venmo_handle && <a className="btn-ghost" href={venmoLink(i.venmo_handle, w.amount, note)} target="_blank" rel="noreferrer">Venmo</a>}
                      {i?.cashapp_tag && <a className="btn-ghost" href={cashAppLink(i.cashapp_tag, w.amount)} target="_blank" rel="noreferrer">Cash App</a>}
                      <select id={sel} aria-label="How you paid" className="input w-auto py-1.5 text-sm"
                        defaultValue={i?.venmo_handle ? "venmo" : i?.cashapp_tag ? "cashapp" : "cash"}>
                        {Object.entries(PAYOUT_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className="btn-primary" disabled={pending}
                        onClick={() => mark(r.quarter, w.user_id, w.amount, (document.getElementById(sel) as HTMLSelectElement).value, true)}>Mark paid out</button>
                    </>
                  ) : w.amount > 0 ? <span className="text-amber-300">Not paid out yet</span> : null}
                </span>
              );
            })}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {myWin && !myInfo?.venmo_handle && !myInfo?.cashapp_tag && (
        <p className="rounded-lg bg-amber-950 p-3 text-sm text-amber-200">
          You won! Add your Venmo or Cash App on your <a href="/account" className="font-semibold underline">Account page</a> so you can get paid.
        </p>
      )}
    </section>
  );
}

function SquaresPaymentPanel({ board, userId, count, settings, payment, adminName }: {
  board: SquaresBoard; userId: string; count: number; settings: AppSettings; payment?: SquaresPayment; adminName?: string;
}) {
  const router = useRouter();
  const price = Number(board.price);
  const who = adminName || "the admin";
  const verified = payment?.verified_squares ?? 0;
  const owedSquares = Math.max(0, count - verified);
  const owed = owedSquares * price;
  const note = `${board.name} (${owedSquares} square${owedSquares === 1 ? "" : "s"})`;
  const methods: PayMethod[] = [
    ...(settings.venmo_handle ? (["venmo"] as const) : []),
    ...(settings.cashapp_tag ? (["cashapp"] as const) : []),
    ...(settings.apple_cash_contact ? (["applecash"] as const) : []),
    "cash",
  ];
  const [method, setMethod] = useState<PayMethod>(payment?.method ?? methods[0]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [changing, setChanging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (owedSquares === 0) {
    return (
      <div className="card flex items-center gap-2 border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        <span className="text-lg">✓</span> All {count} of your squares are paid ({money(count * price)}). {who} confirmed it.
      </div>
    );
  }

  async function markSent() {
    setBusy(true);
    setErr(null);
    const db = createClient();
    const row = { squares: count, method, status: "pending" as const, submitted_at: new Date().toISOString() };
    const { error } = payment
      ? await db.from("squares_payments").update(row).eq("board_id", board.id).eq("user_id", userId)
      : await db.from("squares_payments").insert({ board_id: board.id, user_id: userId, ...row });
    setBusy(false);
    if (error) setErr("Couldn't save that. Try again.");
    else { setChanging(false); notifySquaresPaymentClaimed(board.id).catch(() => {}); }
    router.refresh();
  }

  if (payment?.status === "pending" && payment.squares >= count && !changing) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          <strong>Payment pending.</strong> You said you&apos;re paying {money(owed)} by {METHOD_LABEL[payment.method]} for {owedSquares} square{owedSquares === 1 ? "" : "s"}.
          {" "}{who} will mark it paid once it arrives.
        </p>
        <button className="btn-ghost" onClick={() => setChanging(true)}>Change method</button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">
          {verified > 0 ? `You owe ${money(owed)} for ${owedSquares} more square${owedSquares === 1 ? "" : "s"}` : `You owe ${money(owed)} for ${owedSquares} square${owedSquares === 1 ? "" : "s"}`}
        </h2>
        <span className="text-xs text-slate-500">{money(price)} a square, paid directly to {who}.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={`btn ${method === m ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-ghost"}`}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
        {method === "venmo" && settings.venmo_handle && (
          <div className="space-y-2">
            <p>1. Open Venmo. The amount and note are filled in for you.</p>
            <a className="btn bg-[#008CFF] text-white" target="_blank" rel="noopener noreferrer"
              href={venmoLink(settings.venmo_handle, owed, note)}>Pay @{settings.venmo_handle.replace(/^@/, "")} on Venmo</a>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "cashapp" && settings.cashapp_tag && (
          <div className="space-y-2">
            <p>1. Open Cash App. Add &ldquo;{note}&rdquo; as the note.</p>
            <a className="btn bg-[#00D64F] text-white" target="_blank" rel="noopener noreferrer"
              href={cashAppLink(settings.cashapp_tag, owed)}>Pay ${settings.cashapp_tag.replace(/^\$/, "")} on Cash App</a>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "applecash" && settings.apple_cash_contact && (
          <div className="space-y-2">
            <p>1. In Messages, start a chat with this contact, tap the ＋ button, then Apple Cash, and send {money(owed)}:</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1 font-mono dark:bg-slate-900">{settings.apple_cash_contact}</code>
              <button className="btn-ghost" onClick={async () => {
                await navigator.clipboard.writeText(settings.apple_cash_contact!);
                setCopied(true);
              }}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "cash" && <p>Hand {money(owed)} to {who} in person, then tap &ldquo;I&apos;ll pay cash&rdquo; so they know to expect it.</p>}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={markSent}>
          {method === "cash" ? "I'll pay cash" : "I sent it"}
        </button>
        {changing && <button className="btn-ghost" onClick={() => setChanging(false)}>Cancel</button>}
      </div>
    </div>
  );
}
