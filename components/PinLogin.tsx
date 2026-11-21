"use client";

import { useRef, useState, useTransition } from "react";
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
  const [similar, setSimilar] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // After joining, the invite step is already done, so skip the /join page.
  const dest = mode === "join" && next.startsWith("/join") ? "/" : next;

  function toSignIn(prefill?: string) {
    setMode("signin");
    setMsg(null);
    setSimilar(null);
    setPin("");
    setPin2("");
    if (prefill) setName(prefill);
  }

  // Blocks a second tap while the first is still going (phones can fire two before the button greys out).
  const busy = useRef(false);

  function send(notThem: boolean) {
    if (busy.current) return;
    busy.current = true;
    setMsg(null);
    setSimilar(null);
    start(async () => {
      try {
      const r = mode === "signin" ? await signInWithPin(name, pin) : await joinWithPin(name, pin, code, notThem);
      if (!r.ok) {
        const alike = (r as { similar?: string }).similar;
        if (alike) return setSimilar(alike);
        return setMsg(r.error);
      }
        router.push(dest);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "join" && pin !== pin2) return setMsg("Those PINs don't match.");
    send(false);
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
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3 text-sm">
          <p className="font-semibold text-white">Already joined, on this phone or another one?</p>
          <p className="mt-0.5 text-slate-300">Don&apos;t make a second account. Sign in with the name and PIN you picked.</p>
          <button type="button" className="btn-primary mt-2 w-full" onClick={() => toSignIn()}>I already joined, sign me in</button>
        </div>
      )}
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
        {similar && (
          <div className="space-y-2 rounded-xl border border-amber-400/60 bg-amber-950/40 p-3 text-sm">
            <p className="text-amber-100"><strong>&ldquo;{similar}&rdquo;</strong> already joined. Is that you?</p>
            <button type="button" className="btn-primary w-full" onClick={() => toSignIn(similar)}>Yes, that&apos;s me. Sign me in</button>
            <button type="button" className="btn-ghost w-full" disabled={pending} onClick={() => send(true)}>
              No, I&apos;m someone else. Join as &ldquo;{name.trim()}&rdquo;
            </button>
          </div>
        )}
        <button className="btn-primary w-full py-3 text-base" disabled={pending || pin.length !== 4 || !name.trim()}>
          {pending ? "One sec…" : mode === "signin" ? "Sign in" : "Join and start picking"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-400">
        {mode === "signin" ? (
          <>First time? <button className="font-semibold text-emerald-400 underline" onClick={() => { setMode("join"); setMsg(null); setSimilar(null); }}>Join with a name and PIN</button></>
        ) : (
          <>Already joined? <button className="font-semibold text-emerald-400 underline" onClick={() => toSignIn()}>Sign in</button></>
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
