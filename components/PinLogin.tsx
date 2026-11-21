"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinWithPin, signInWithPin } from "@/app/login/actions";

/** Name + 4-digit PIN sign-in, the main way players get in. */
export default function PinLogin({ next, inviteCode, onUseEmail }: {
  next: string; inviteCode: string | null; onUseEmail: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "join">(inviteCode ? "join" : "signin");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [code, setCode] = useState(inviteCode ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // After joining, the invite step is already done, so skip the /join page.
  const dest = mode === "join" && next.startsWith("/join") ? "/" : next;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (mode === "join" && pin !== pin2) return setMsg("Those PINs don't match.");
    start(async () => {
      const r = mode === "signin" ? await signInWithPin(name, pin) : await joinWithPin(name, pin, code);
      if (!r.ok) return setMsg(r.error);
      router.push(dest);
      router.refresh();
    });
  }

  const pinInput = (id: string, value: string, set: (v: string) => void, label: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type="password" inputMode="numeric" autoComplete={mode === "signin" ? "current-password" : "new-password"}
        pattern="\d{4}" maxLength={4} required placeholder="••••"
        className="input text-center font-mono text-2xl tracking-[0.6em]"
        value={value} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 4))} />
    </div>
  );

  return (
    <div className="card space-y-4">
      <h1 className="text-3xl font-bold text-white">{mode === "signin" ? "Sign in" : "Join the pool"}</h1>
      {mode === "join" && (
        <p className="text-sm text-slate-400">
          Pick the name everyone will see on the leaderboard, and a 4-digit PIN. You&apos;ll use both to sign in on any phone.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="pname">Your name</label>
          <input id="pname" className="input" required autoComplete="username" autoCapitalize="words" maxLength={24}
            placeholder="e.g. Big Mike" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {pinInput("pin", pin, setPin, mode === "signin" ? "PIN" : "Choose a 4-digit PIN")}
        {mode === "join" && pinInput("pin2", pin2, setPin2, "Type the PIN again")}
        {mode === "join" && !inviteCode && (
          <div>
            <label className="label" htmlFor="code">Invite code</label>
            <input id="code" className="input font-mono" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={pending || pin.length !== 4 || !name.trim()}>
          {pending ? "One sec…" : mode === "signin" ? "Sign in" : "Join and start picking"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-400">
        {mode === "signin" ? (
          <>First time? <button className="font-semibold text-emerald-400 underline" onClick={() => { setMode("join"); setMsg(null); }}>Join with a name and PIN</button></>
        ) : (
          <>Already joined? <button className="font-semibold text-emerald-400 underline" onClick={() => { setMode("signin"); setMsg(null); }}>Sign in</button></>
        )}
      </p>
      {mode === "signin" && (
        <p className="text-center text-xs text-slate-500">Forgot your PIN? Ask the pool admin to reset it.</p>
      )}
      <div className="border-t border-slate-800 pt-3 text-center">
        <button className="text-sm font-semibold text-slate-400 hover:text-white" onClick={onUseEmail}>
          Use email and password instead
        </button>
      </div>
    </div>
  );
}
