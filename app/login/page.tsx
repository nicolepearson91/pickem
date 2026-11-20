"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "link" | "forgot";

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create your account",
  link: "Email me a sign-in link",
  forgot: "Reset your password",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(
    params.get("error") === "link"
      ? "That link didn't work. It may have expired or been used already, or it was opened on a different device. Try again below."
      : null,
  );
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const callback = (to: string) => `${location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  function go(m: Mode) {
    setMode(m);
    setMsg(null);
    setSent(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "link") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callback(next), shouldCreateUser: false },
        });
        if (error) return setMsg(friendly(error.message));
        return setSent(true);
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/reset-password") });
        if (error) return setMsg(friendly(error.message));
        return setSent(true);
      }
      const res =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { data: { display_name: name.trim() }, emailRedirectTo: callback(next) },
            });
      if (res.error) return setMsg(friendly(res.error.message));
      if (mode === "signup" && !res.data.session) {
        return setMsg("Check your email to confirm your account, then come back and sign in.");
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(next) } });
  }

  const linkBtn = "font-semibold text-emerald-700 underline dark:text-emerald-400";

  return (
    <div className="mx-auto max-w-sm">
      <div className="card space-y-4">
        <h1 className="text-2xl font-black">{TITLES[mode]}</h1>

        {sent ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              If there&apos;s an account for <strong>{email}</strong>, an email is on its way.
              {mode === "forgot" ? " Click the link in it to choose a new password." : " Click the link in it to sign in."}
            </p>
            <p className="text-slate-500">
              Open the link on this same phone or computer. Nothing after a few minutes? Check spam, or ask the pool admin
              for a reset link.
            </p>
            <button className={linkBtn} onClick={() => go("signin")}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="name">Name on the leaderboard</label>
                <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {(mode === "signin" || mode === "signup") && (
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label" htmlFor="pw">Password</label>
                  {mode === "signin" && (
                    <button type="button" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                      onClick={() => go("forgot")}>Forgot password?</button>
                  )}
                </div>
                <input id="pw" type="password" className="input" required minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {msg && <p className="text-sm text-amber-700 dark:text-amber-400">{msg}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "One sec…"
                : mode === "signin" ? "Sign in"
                : mode === "signup" ? "Create account"
                : mode === "link" ? "Email me a link"
                : "Email me a reset link"}
            </button>
          </form>
        )}

        {!sent && mode === "signin" && (
          <>
            <button className="btn-ghost w-full" onClick={() => go("link")}>Email me a sign-in link instead</button>
            <button className="btn-ghost w-full" onClick={google}>Continue with Google</button>
          </>
        )}

        {!sent && (
          <p className="text-center text-sm text-slate-500">
            {mode === "signin" ? (
              <>New here? <button className={linkBtn} onClick={() => go("signup")}>Create an account</button></>
            ) : (
              <>Remembered it? <button className={linkBtn} onClick={() => go("signin")}>Sign in with a password</button></>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function friendly(m: string) {
  if (/rate limit|too many/i.test(m)) return "Too many emails were sent recently. Wait a bit, or ask the pool admin for a reset link.";
  if (/signups not allowed|user not found/i.test(m)) return "There's no account with that email yet. Create one instead.";
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. Try again, or use Forgot password.";
  return m;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
