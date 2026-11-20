"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Reached from a password reset link, which has already signed the person in.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </div>
  );
}
