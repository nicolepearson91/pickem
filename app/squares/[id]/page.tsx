import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import SquaresView from "@/components/SquaresView";
import type { Square, SquaresBoard, SquaresPayment, SquaresPayout } from "@/lib/squares";
import type { AppSettings, PayoutInfo, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const bid = Number((await params).id);
  if (!Number.isFinite(bid)) notFound();
  const { supabase, user, profile } = await requireMember();
  const [board, squares, pays, payouts, people, settings, payoutInfo] = await Promise.all([
    supabase.from("squares_boards").select("*").eq("id", bid).maybeSingle<SquaresBoard>(),
    supabase.from("squares").select("board_id, row_idx, col_idx, user_id").eq("board_id", bid),
    supabase.from("squares_payments").select("*").eq("board_id", bid),
    supabase.from("squares_payouts").select("*").eq("board_id", bid),
    supabase.from("profiles").select("id, display_name, is_admin, is_member"),
    supabase.from("app_settings").select("venmo_handle, cashapp_tag, apple_cash_contact").eq("id", 1).maybeSingle<AppSettings>(),
    supabase.from("payout_info").select("user_id, venmo_handle, cashapp_tag"),
  ]);
  if (!board.data) notFound();
  return (
    <SquaresView
      me={profile}
      userId={user.id}
      board={board.data}
      squares={(squares.data ?? []) as Square[]}
      payments={(pays.data ?? []) as SquaresPayment[]}
      payouts={(payouts.data ?? []) as SquaresPayout[]}
      people={(people.data ?? []) as Profile[]}
      payoutInfo={(payoutInfo.data ?? []) as PayoutInfo[]}
      settings={settings.data ?? { venmo_handle: null, cashapp_tag: null, apple_cash_contact: null }}
    />
  );
}
