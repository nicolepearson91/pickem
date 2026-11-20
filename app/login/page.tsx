"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: name.trim() },
              emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (mode === "signup" && !res.data.session) {
      return setMsg("Check your email to confirm your account, then come back and sign in.");
    }
    router.push(next);
    router.refresh();
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="card space-y-4">
        <h1 className="text-2xl font-black">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
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
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" type="password" className="input" required minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {msg && <p className="text-sm text-amber-700 dark:text-amber-400">{msg}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "One sec…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button className="btn-ghost w-full" onClick={google}>Continue with Google</button>
        <p className="text-center text-sm text-slate-500">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button className="font-semibold text-emerald-700 underline dark:text-emerald-400"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
