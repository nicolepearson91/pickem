"use client";

import { useState, useTransition } from "react";
import { notifyNewWeek } from "@/app/notifications/actions";

/** Admin: re-send the "new pick em" alert, or share the link to a group text for players without alerts. */
export default function NewWeekTools({ contestId, name, link }: { contestId: number; name: string; link: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const text = `🏈 ${name} is up! Make your picks before kickoff:`;

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: name, text, url: link }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${link}`); setMsg("Copied. Paste it into your group text."); }
    catch { window.prompt("Copy this and send it to the group:", `${text} ${link}`); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-primary" onClick={share}>📣 Text the group</button>
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => {
        const { sent } = await notifyNewWeek(contestId);
        setMsg(sent ? `Sent to ${sent} phone${sent === 1 ? "" : "s"}.` : "No players have notifications turned on yet.");
      })}>{pending ? "Sending…" : "🔔 Send the alert again"}</button>
      {msg && <span className="w-full text-sm text-slate-300">{msg}</span>}
    </div>
  );
}
