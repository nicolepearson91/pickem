"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendResetEmail } from "@/app/login/actions";

type State = "checking" | "ready" | "bad";

/**
 * Where password reset emails land. Works whether the link signed the person in already
 * (same-device link, or the admin's one-time link) or carries the sign-in in the address (#access_token=…).
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    (async () => {
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        history.replaceState(null, "", window.location.pathname);
        return setState(error ? "bad" : "ready");
      }
      if (hash.get("error") || hash.get("error_code")) return setState("bad");
      const { data } = await supabase.auth.getUser();
      setState(data.user ? "ready" : "bad");
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg("Those passwords don't match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.push("/");
    router.refresh();
  }

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await sendResetEmail(email);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setSent(true);
  }

  if (state === "checking") return <div className="mx-auto max-w-sm card text-slate-400">One sec…</div>;

  if (state === "bad") {
    return (
      <div className="mx-auto max-w-sm">
        <div className="card space-y-3">
          <h1 className="text-2xl font-black">That link has expired</h1>
          {sent ? (
            <p className="rounded-lg bg-emerald-950 p-3 text-sm text-emerald-200">
              A new link is on its way to <strong>{email}</strong>. Open the newest email and tap its link once.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Reset links work once and only the newest one works. Enter your email and we&apos;ll send a fresh one.
              </p>
              <form onSubmit={resend} className="space-y-3">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" type="email" className="input" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {msg && <p className="text-sm text-amber-300">{msg}</p>}
                <button className="btn-primary w-full" disabled={busy}>{busy ? "One sec…" : "Email me a new link"}</button>
              </form>
            </>
          )}
          <a href="/login" className="block text-center text-sm font-semibold text-emerald-400 underline">Back to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={save} className="card space-y-3">
        <h1 className="text-2xl font-black">Choose a new password</h1>
        <div>
          <label className="label" htmlFor="pw">New password</label>
          <input id="pw" type="password" className="input" required minLength={6} autoComplete="new-password"
            value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw2">Type it again</label>
          <input id="pw2" type="password" className="input" required minLength={6} autoComplete="new-password"
            value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {msg && <p className="text-sm text-red-400">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </div>
  );
}
