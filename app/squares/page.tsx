import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { money } from "@/lib/payments";
import { squaresPot, teamLabel, type SquaresBoard, type SquaresPayment } from "@/lib/squares";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

export default async function SquaresPage() {
  const { supabase, user, profile } = await requireMember();
  const [{ data: boards, error }, { data: squares }, { data: pays }] = await Promise.all([
    supabase.from("squares_boards").select("*").order("created_at", { ascending: false }).order("price").limit(50),
    supabase.from("squares").select("board_id, user_id"),
    supabase.from("squares_payments").select("board_id, squares, verified_squares, status"),
  ]);
  const list = (boards ?? []) as SquaresBoard[];
  const open = list.filter((b) => b.status === "open");
  const closed = list.filter((b) => b.status === "closed");
  const card = (b: SquaresBoard) => {
    const taken = (squares ?? []).filter((s) => s.board_id === b.id);
    const mine = taken.filter((s) => s.user_id === user.id).length;
    const pot = squaresPot(((pays ?? []) as SquaresPayment[]).filter((p) => p.board_id === b.id), Number(b.price)).pot;
    return (
      <Link key={b.id} href={`/squares/${b.id}`} className="card block transition hover:border-emerald-500">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide">
          <span className="text-amber-300">{money(Number(b.price))} a square</span>
          {b.state === "in" ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-white">LIVE</span>
            : b.state === "post" ? <span className="text-slate-400">Final</span>
            : b.col_digits ? <span className="text-slate-400">Numbers drawn</span> : null}
        </div>
        <h3 className="mt-1 text-lg font-bold">{b.name}</h3>
        <p className="text-sm text-slate-400">
          {b.espn_id ? <>{teamLabel(b, "away")} at {teamLabel(b, "home")}{b.kickoff && b.state === "pre" && <> · <LocalTime iso={b.kickoff} /></>}</> : "Teams to be announced"}
        </p>
        <div className="mt-3 grid h-2 grid-cols-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-emerald-500" style={{ width: `${taken.length}%` }} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {100 - taken.length} of 100 squares left{mine > 0 && <> · <span className="font-semibold text-emerald-400">you have {mine}</span></>}
          {pot > 0 && <> · Pot <span className="font-semibold text-amber-300">{money(pot)}</span></>}
        </p>
      </Link>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Squares</h1>
          <p className="text-slate-500">Claim squares on a 10 by 10 board. The score at the end of each quarter picks a winner.</p>
        </div>
        {profile.is_admin && <Link href="/admin/squares/new" className="btn-primary">+ New squares board</Link>}
      </div>
      {error && profile.is_admin && (
        <p className="card text-sm text-amber-300">Squares need a one-time setup: run the Super Bowl squares SQL in Supabase.</p>
      )}
      {open.length === 0 && (
        <div className="card text-slate-500">No squares boards open right now.{profile.is_admin ? " Make one with New squares board." : " Check back soon."}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{open.map(card)}</div>
      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-500">Past boards</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{closed.map(card)}</div>
        </section>
      )}
    </div>
  );
}
