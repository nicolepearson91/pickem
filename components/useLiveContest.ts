"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Game } from "@/lib/types";

/**
 * Keeps a contest page live: listens for database changes on this contest and re-renders,
 * and while any game is underway nudges the score sync about once a minute.
 */
export function useLiveContest(contestId: number, games: Pick<Game, "state" | "kickoff">[]) {
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
      // The live feed checks row security as the signed-in player, so hand it their token
      // before subscribing. Without this it connects as a guest and receives nothing.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      const filter = `contest_id=eq.${contestId}`;
      channel = supabase
        .channel(`contest-${contestId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "games", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "picks", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "tiebreakers", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "contests", filter: `id=eq.${contestId}` }, refresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [contestId, router]);

  const needsSync = games.some(
    (g) => g.state === "in" || (g.state === "pre" && new Date(g.kickoff).getTime() < Date.now() + 5 * 60_000),
  );
  useEffect(() => {
    if (!needsSync) return;
    const ping = () => fetch("/api/sync-scores", { method: "POST" }).catch(() => {});
    ping();
    const t = setInterval(ping, 60_000);
    // Also refresh once a minute so locks and clocks stay current even without a change event.
    const r = setInterval(() => router.refresh(), 60_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [needsSync, router]);
}
