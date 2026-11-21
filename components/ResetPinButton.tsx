"use client";

import { useState, useTransition } from "react";
import { resetPin } from "@/app/admin/actions";

export default function ResetPinButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>Reset PIN</button>;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await resetPin(userId, pin);
        setMsg(r.ok ? `Done. Tell ${name} their new PIN is ${pin}.` : r.error ?? "Something went wrong.");
        if (r.ok) setPin("");
      });
    }}>
      <input className="input w-24 text-center font-mono tracking-[0.4em]" inputMode="numeric" pattern="\d{4}" maxLength={4}
        placeholder="0000" aria-label={`New PIN for ${name}`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      <button className="btn-primary" disabled={pending || pin.length !== 4}>{pending ? "…" : "Set PIN"}</button>
      {msg && <span className="w-full text-xs text-emerald-300">{msg}</span>}
    </form>
  );
}
