"use client";

import { useState, useTransition } from "react";
import { makeResetLink } from "@/app/admin/actions";

export default function ResetLinkButton({ userId, name }: { userId: string; name: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  if (link) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Text this to {name}. It works once, within an hour.</span>
        <button className="btn-primary" onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}>{copied ? "Copied ✓" : "Copy reset link"}</button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => {
        const r = await makeResetLink(userId);
        if (r.link) setLink(r.link); else setErr(r.error ?? "Something went wrong.");
      })}>{pending ? "…" : "Password reset link"}</button>
    </span>
  );
}
