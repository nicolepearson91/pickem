"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Keeps a squares board live: re-renders on any change, and nudges the score sync during the game. */
export function useLiveBoard(boardId: number, game: { state: string; kickoff: string | null; espn_id: string | null }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      const filter = `board_id=eq.${boardId}`;
      channel = supabase
        .channel(`board-${boardId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "squares_boards", filter: `id=eq.${boardId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "squares", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "squares_payments", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "squares_payouts", filter }, refresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [boardId, router]);

  const needsSync = !!game.espn_id && (game.state === "in"
    || (game.state === "pre" && !!game.kickoff && new Date(game.kickoff).getTime() < Date.now() + 5 * 60_000));
  useEffect(() => {
    if (!needsSync) return;
    const ping = () => fetch("/api/sync-scores", { method: "POST" }).catch(() => {});
    ping();
    const t = setInterval(ping, 60_000);
    const r = setInterval(() => router.refresh(), 60_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [needsSync, router]);
}
