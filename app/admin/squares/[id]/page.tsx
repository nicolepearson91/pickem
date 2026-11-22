import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { METHOD_LABEL, money } from "@/lib/payments";
import { guessSeason } from "@/lib/espn";
import { squaresPot, type Square, type SquaresBoard, type SquaresPayment } from "@/lib/squares";
import type { PayMethod, Profile } from "@/lib/types";
import {
  confirmSquaresPayment, deleteBoard, recordSquaresPayment, rejectSquaresPayment, setBoardStatus, undoSquaresPayment,
} from "../actions";
import { BoardAssign, BoardGame, BoardNumbers, BoardScores, BoardSettings } from "@/components/AdminBoardTools";

export const dynamic = "force-dynamic";

export default async function AdminBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const bid = Number((await params).id);
  if (!Number.isFinite(bid)) notFound();
  const { supabase, user } = await requireAdmin();
  const [{ data: board }, { data: squares }, { data: payments }, { data: people }] = await Promise.all([
    supabase.from("squares_boards").select("*").eq("id", bid).maybeSingle<SquaresBoard>(),
    supabase.from("squares").select("board_id, row_idx, col_idx, user_id").eq("board_id", bid),
    supabase.from("squares_payments").select("*").eq("board_id", bid),
    supabase.from("profiles").select("id, display_name, is_admin, is_member").order("display_name"),
  ]);
  if (!board) notFound();
  const sq = (squares ?? []) as Square[];
  const pays = (payments ?? []) as SquaresPayment[];
  const price = Number(board.price);
  const pot = squaresPot(pays, price);
  const players = ((people ?? []) as Profile[]).filter((p) => p.is_member || p.is_admin);
  const nameBy = new Map(players.map((p) => [p.id, p.display_name]));
  const count = new Map<string, number>();
  sq.forEach((s) => count.set(s.user_id, (count.get(s.user_id) ?? 0) + 1));
  const payBy = new Map(pays.map((p) => [p.user_id, p]));
  const holders = [...new Set([...count.keys(), ...payBy.keys()])]
    .sort((a, b) => (nameBy.get(a) ?? "").localeCompare(nameBy.get(b) ?? ""));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-slate-500 hover:underline">← Admin</Link>
          <h1 className="text-3xl font-black">{board.name}</h1>
          <p className="text-sm text-slate-400">{sq.length} of 100 squares taken · Pot {money(pot.pot)} confirmed{pot.pendingSquares > 0 && `, ${money(pot.pendingAmount)} waiting on you`}</p>
        </div>
        <Link href={`/squares/${bid}`} className="btn-ghost">View board</Link>
      </div>

      {price > 0 && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Payments · {money(price)} a square</h2>
            <p className="text-sm text-slate-500">{pot.paidSquares} squares paid ({money(pot.pot)})</p>
          </div>
          <p className="text-sm text-slate-500">Check Venmo, Cash App, Apple Cash, or your cash before you confirm. The app can&apos;t see whether money arrived.</p>
          {holders.length === 0 && <p className="text-sm text-slate-500">Nobody has squares yet.</p>}
          <ul className="divide-y divide-slate-800">
            {holders.map((id) => {
              const n = count.get(id) ?? 0;
              const pay = payBy.get(id);
              const paid = pay?.verified_squares ?? 0;
              const waiting = pay?.status === "pending" ? Math.max(0, pay.squares - paid) : 0;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">{nameBy.get(id) ?? "Someone"}</span>
                    <span className="ml-2 text-slate-400">{n} square{n === 1 ? "" : "s"} · owes {money(n * price)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {paid > 0 && <span className="font-semibold text-emerald-400">✓ {money(paid * price)} paid{pay ? ` · ${METHOD_LABEL[pay.method]}` : ""}</span>}
                    {waiting > 0 ? (
                      <>
                        <span className="font-semibold text-amber-300">Says they sent {money(waiting * price)} by {METHOD_LABEL[pay!.method]}</span>
                        <form action={confirmSquaresPayment.bind(null, bid, id)}><button className="btn-primary">Confirm received</button></form>
                        <form action={rejectSquaresPayment.bind(null, bid, id)}><button className="btn-danger">Not received</button></form>
                      </>
                    ) : paid < n ? (
                      <>
                        <span className="text-red-400">{money((n - paid) * price)} unpaid</span>
                        {(["cash", "venmo", "cashapp", "applecash"] as PayMethod[]).map((m) => (
                          <form key={m} action={recordSquaresPayment.bind(null, bid, id, m)}>
                            <button className="btn-ghost text-xs">Got {METHOD_LABEL[m]}</button>
                          </form>
                        ))}
                      </>
                    ) : null}
                    {paid > 0 && waiting === 0 && (
                      <form action={undoSquaresPayment.bind(null, bid, id)}><button className="btn-ghost text-xs">Undo</button></form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <BoardSettings board={board} />
      <BoardGame board={board} season={board.season ?? guessSeason(new Date())} />
      <BoardNumbers board={board} taken={sq.length} />
      <BoardScores board={board} />
      <BoardAssign board={board} squares={sq} adminId={user.id}
        players={players.map((p) => ({ id: p.id, name: p.display_name }))} />

      <section className="card flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-bold">Status: {board.status === "open" ? "Open" : "Closed"}</h2>
        <form action={setBoardStatus.bind(null, bid, board.status === "open" ? "closed" : "open")}>
          <button className="btn-ghost">{board.status === "open" ? "Close (stops changes and score updates)" : "Reopen"}</button>
        </form>
        <details className="relative">
          <summary className="btn-danger list-none">Delete board</summary>
          <form action={deleteBoard.bind(null, bid)} className="mt-2 flex items-center gap-2 text-sm">
            <span>
              {sq.length > 0 || pays.length > 0
                ? <><strong className="text-red-400">Heads up:</strong> {sq.length} square{sq.length === 1 ? "" : "s"} and {pays.length} payment record{pays.length === 1 ? "" : "s"} will be erased too. This can&apos;t be undone.</>
                : "Nobody has squares yet. This can't be undone."}
            </span>
            <button className="btn bg-red-600 text-white hover:bg-red-700">Yes, delete</button>
          </form>
        </details>
      </section>
    </div>
  );
}
