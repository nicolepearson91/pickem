"use client";

import { useTransition, useState } from "react";
import { setPaidOut } from "@/app/admin/actions";
import { cashAppLink, money, venmoLink } from "@/lib/payments";
import { ordinal } from "@/lib/scoring";
import type { PayoutRow } from "@/lib/payouts";
import type { Payout, PayoutInfo } from "@/lib/types";

const METHOD: Record<string, string> = { venmo: "Venmo", cashapp: "Cash App", applecash: "Apple Cash", cash: "Cash" };

export default function PayoutPanel({ contestId, contestName, rows, payouts, info, isAdmin, userId, secondPct }: {
  contestId: number; contestName: string; rows: PayoutRow[]; payouts: Payout[]; info: PayoutInfo[];
  isAdmin: boolean; userId: string; secondPct: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const paidBy = new Map(payouts.map((p) => [p.user_id, p]));
  const infoBy = new Map(info.map((i) => [i.user_id, i]));
  const mark = (r: PayoutRow, method: string | null, paid: boolean) => start(async () => {
    setError(null);
    const res = await setPaidOut(contestId, r.user_id, r.amount, method, paid);
    if (res.error) setError(res.error);
  });
  const myInfo = infoBy.get(userId);
  const iWon = rows.some((r) => r.user_id === userId);

  return (
    <section className="rounded-3xl border border-amber-400/60 bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase text-amber-300">🏆 Winnings</h2>
        <p className="text-xs text-slate-400">{secondPct > 0 ? `${100 - secondPct}% to 1st, ${secondPct}% to 2nd` : "Winner takes all"}{rows.length > 1 && rows[0].place === rows[1].place ? " · ties split evenly" : ""}</p>
      </div>
      <ul className="divide-y divide-slate-800">
        {rows.map((r) => {
          const paid = paidBy.get(r.user_id);
          const i = infoBy.get(r.user_id);
          const note = `${contestName} winnings`;
          return (
            <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-bold text-white">{r.display_name}</span>
                <span className="ml-2 text-sm text-slate-400">{ordinal(r.place)}</span>
                <span className="ml-3 font-display text-xl font-bold tabular-nums text-amber-300">{money(r.amount)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {paid ? (
                  <>
                    <span className="font-semibold text-emerald-400">✓ Paid out{paid.method ? ` · ${METHOD[paid.method] ?? paid.method}` : ""}</span>
                    {isAdmin && <button className="btn-ghost text-xs" disabled={pending} onClick={() => mark(r, null, false)}>Undo</button>}
                  </>
                ) : isAdmin ? (
                  <>
                    {i?.venmo_handle && <a className="btn-ghost" href={venmoLink(i.venmo_handle, r.amount, note)} target="_blank" rel="noreferrer">Pay with Venmo</a>}
                    {i?.cashapp_tag && <a className="btn-ghost" href={cashAppLink(i.cashapp_tag, r.amount)} target="_blank" rel="noreferrer">Pay with Cash App</a>}
                    {!i?.venmo_handle && !i?.cashapp_tag && <span className="text-xs text-slate-400">No Venmo or Cash App saved yet</span>}
                    <select aria-label={`How you paid ${r.display_name}`} className="input w-auto py-1.5 text-sm" id={`m-${r.user_id}`}
                      defaultValue={i?.venmo_handle ? "venmo" : i?.cashapp_tag ? "cashapp" : "cash"}>
                      {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn-primary" disabled={pending}
                      onClick={() => mark(r, (document.getElementById(`m-${r.user_id}`) as HTMLSelectElement).value, true)}>Mark paid out</button>
                  </>
                ) : (
                  <span className="text-amber-300">Not paid out yet</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {iWon && !paidBy.has(userId) && !myInfo?.venmo_handle && !myInfo?.cashapp_tag && (
        <p className="rounded-lg bg-amber-950 p-3 text-sm text-amber-200">
          You won! Add your Venmo or Cash App on your <a href="/account" className="font-semibold underline">Account page</a> so you can get paid.
        </p>
      )}
    </section>
  );
}
