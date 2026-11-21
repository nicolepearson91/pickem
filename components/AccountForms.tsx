"use client";

import { useState, useTransition } from "react";
import { changePassword, changePin, rename } from "@/app/account/actions";

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-amber-300"}`}>{msg.text}</p>;
}

export function NameForm({ name, usesPin }: { name: string; usesPin: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="card space-y-3" action={(fd) => start(async () => {
      const r = await rename(fd);
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    })}>
      <h1 className="text-2xl font-black">Your account</h1>
      <div>
        <label className="label" htmlFor="name">Name on the leaderboard</label>
        <input id="name" name="name" className="input" defaultValue={name} maxLength={24} required />
        {usesPin && <p className="mt-1 text-xs text-slate-400">You also sign in with this name.</p>}
      </div>
      <Status msg={msg} />
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

export function PinForm() {
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const field = (id: string, label: string, v: string, set: (s: string) => void, ac: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete={ac}
        className="input text-center font-mono text-2xl tracking-[0.6em]" value={v} onChange={(e) => set(digits(e.target.value))} />
    </div>
  );
  return (
    <form className="card space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (pin !== pin2) return setMsg({ ok: false, text: "Those new PINs don't match." });
      start(async () => {
        const r = await changePin(cur, pin);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setCur(""); setPin(""); setPin2("");
        setMsg({ ok: true, text: "PIN changed. Use the new one next time you sign in." });
      });
    }}>
      <h2 className="text-lg font-bold">Change your PIN</h2>
      {field("curpin", "Current PIN", cur, setCur, "current-password")}
      {field("newpin", "New 4-digit PIN", pin, setPin, "new-password")}
      {field("newpin2", "Type the new PIN again", pin2, setPin2, "new-password")}
      <Status msg={msg} />
      <button className="btn-primary" disabled={pending || cur.length !== 4 || pin.length !== 4}>{pending ? "Saving…" : "Change PIN"}</button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="card space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (pw !== pw2) return setMsg({ ok: false, text: "Those new passwords don't match." });
      start(async () => {
        const r = await changePassword(cur, pw);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setCur(""); setPw(""); setPw2("");
        setMsg({ ok: true, text: "Password changed." });
      });
    }}>
      <h2 className="text-lg font-bold">{hasPassword ? "Change your password" : "Set a password"}</h2>
      {!hasPassword && <p className="text-sm text-slate-400">You signed in with Google or an email link. Set a password to also sign in with your email and password.</p>}
      {hasPassword && (
        <div>
          <label className="label" htmlFor="curpw">Current password</label>
          <input id="curpw" type="password" className="input" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="newpw">New password</label>
        <input id="newpw" type="password" className="input" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="newpw2">Type it again</label>
        <input id="newpw2" type="password" className="input" required minLength={6} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <Status msg={msg} />
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}</button>
    </form>
  );
}
