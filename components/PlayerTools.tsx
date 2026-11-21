"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePlayer, mergePlayer, renamePlayer } from "@/app/admin/actions";

export interface PlayerOption { id: string; label: string; name: string }

/** Admin tools for a player: rename them, merge a duplicate into the right account, or delete it. */
export default function PlayerTools({ id, name, picks, payments, others, suggest }: {
  id: string; name: string; picks: number; payments: number; others: PlayerOption[]; suggest?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(suggest ?? "");
  const [newName, setNewName] = useState(name);
  const [confirm, setConfirm] = useState<"merge" | "delete" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const targetName = others.find((o) => o.id === target)?.name;
  const has = `${picks} pick${picks === 1 ? "" : "s"} and ${payments} payment${payments === 1 ? "" : "s"}`;

  const run = (kind: "merge" | "delete" | "rename") => start(async () => {
    const r = kind === "merge" ? await mergePlayer(id, target) : kind === "rename" ? await renamePlayer(id, newName) : await deletePlayer(id);
    setConfirm(null);
    setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  if (msg?.ok) return <span className="text-xs text-emerald-400">{msg.text}</span>;
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>Rename, merge or delete</button>;

  return (
    <div className="w-full space-y-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">
      <p className="text-slate-300"><strong className="text-white">{name}</strong> has {has}.</p>

      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run("rename"); }}>
        <label className="text-slate-400" htmlFor={`rename-${id}`}>Rename to</label>
        <input id={`rename-${id}`} className="input w-44 py-1.5" maxLength={24} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-ghost" disabled={pending || !newName.trim() || newName.trim() === name}>Rename</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-slate-400" htmlFor={`merge-${id}`}>Same person as</label>
        <select id={`merge-${id}`} className="input w-auto py-1.5" value={target}
          onChange={(e) => { setTarget(e.target.value); setConfirm(null); }}>
          <option value="">Choose their main account…</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button className="btn-primary" disabled={!target || pending} onClick={() => setConfirm("merge")}>Merge</button>
      </div>
      {confirm === "merge" && targetName && (
        <div className="rounded-lg bg-slate-900 p-2.5">
          <p>
            Move {name}&apos;s {has} into <strong>{targetName}</strong>, then remove the &ldquo;{name}&rdquo; account?
            If both picked the same game, {targetName}&apos;s pick is kept. They&apos;ll sign in as {targetName} from now on.
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={() => run("merge")}>{pending ? "Merging…" : "Yes, merge"}</button>
            <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800 pt-2">
        {confirm === "delete" ? (
          <div className="rounded-lg bg-red-950/60 p-2.5 text-red-100">
            <p>
              Delete &ldquo;{name}&rdquo; for good?{" "}
              {picks + payments > 0 ? <strong>Their {has} will be erased too.</strong> : "They have no picks or payments."}{" "}
              This can&apos;t be undone.
            </p>
            <div className="mt-2 flex gap-2">
              <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={pending} onClick={() => run("delete")}>
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-danger" onClick={() => setConfirm("delete")}>Delete account</button>
        )}
      </div>
      {msg && !msg.ok && <p className="text-amber-300">{msg.text}</p>}
      <button className="text-xs text-slate-400 underline" onClick={() => { setOpen(false); setConfirm(null); setMsg(null); }}>Close</button>
    </div>
  );
}
