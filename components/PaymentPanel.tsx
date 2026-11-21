"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cashAppLink, METHOD_LABEL, money, venmoLink } from "@/lib/payments";
import type { AppSettings, Contest, Payment, PayMethod } from "@/lib/types";
import { useRouter } from "next/navigation";
import { notifyPaymentClaimed } from "@/app/notifications/actions";

export default function PaymentPanel({ contest, userId, settings, payment, adminName }: {
  contest: Contest; userId: string; settings: AppSettings; payment?: Payment; adminName?: string;
}) {
  const router = useRouter();
  const fee = Number(contest.entry_fee);
  const who = adminName || "the admin";
  const note = contest.name;
  const methods: PayMethod[] = [
    ...(settings.venmo_handle ? (["venmo"] as const) : []),
    ...(settings.cashapp_tag ? (["cashapp"] as const) : []),
    ...(settings.apple_cash_contact ? (["applecash"] as const) : []),
    "cash",
  ];
  const [method, setMethod] = useState<PayMethod>(payment?.method ?? methods[0]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (payment?.status === "verified") {
    return (
      <div className="card flex items-center gap-2 border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        <span className="text-lg">✓</span> Entry paid ({money(fee)} by {METHOD_LABEL[payment.method]}). {who} confirmed it.
      </div>
    );
  }

  async function markSent() {
    setBusy(true);
    setErr(null);
    const { error } = await createClient().from("payments").upsert(
      { contest_id: contest.id, user_id: userId, method, status: "pending", submitted_at: new Date().toISOString() },
      { onConflict: "contest_id,user_id" },
    );
    setBusy(false);
    if (error) setErr("Couldn't save that. Try again.");
    // Ping the admin's phone. Never let a notification problem get in the player's way.
    else notifyPaymentClaimed(contest.id).catch(() => {});
    router.refresh();
  }

  async function undo() {
    setBusy(true);
    await createClient().from("payments").delete().eq("contest_id", contest.id).eq("user_id", userId);
    setBusy(false);
    router.refresh();
  }

  if (payment) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          <strong>Payment pending.</strong> You said you&apos;re paying {money(fee)} by {METHOD_LABEL[payment.method]}.
          {" "}{who} will mark it paid once it arrives.
        </p>
        <button className="btn-ghost" disabled={busy} onClick={undo}>Change method</button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Entry fee: {money(fee)}</h2>
        <span className="text-xs text-slate-500">Paid directly to {who}. Your picks count either way.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={`btn ${method === m ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-ghost"}`}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
        {method === "venmo" && settings.venmo_handle && (
          <div className="space-y-2">
            <p>1. Open Venmo. The amount and note are filled in for you.</p>
            <a className="btn bg-[#008CFF] text-white" target="_blank" rel="noopener noreferrer"
              href={venmoLink(settings.venmo_handle, fee, note)}>Pay @{settings.venmo_handle.replace(/^@/, "")} on Venmo</a>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "cashapp" && settings.cashapp_tag && (
          <div className="space-y-2">
            <p>1. Open Cash App. Add &ldquo;{note}&rdquo; as the note.</p>
            <a className="btn bg-[#00D64F] text-white" target="_blank" rel="noopener noreferrer"
              href={cashAppLink(settings.cashapp_tag, fee)}>Pay ${settings.cashapp_tag.replace(/^\$/, "")} on Cash App</a>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "applecash" && settings.apple_cash_contact && (
          <div className="space-y-2">
            <p>1. In Messages, start a chat with this contact, tap the ＋ button, then Apple Cash, and send {money(fee)}:</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1 font-mono dark:bg-slate-900">{settings.apple_cash_contact}</code>
              <button className="btn-ghost" onClick={async () => {
                await navigator.clipboard.writeText(settings.apple_cash_contact!);
                setCopied(true);
              }}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <p>2. Come back and tap &ldquo;I sent it&rdquo;.</p>
          </div>
        )}
        {method === "cash" && <p>Hand {money(fee)} to {who} in person, then tap &ldquo;I&apos;ll pay cash&rdquo; so they know to expect it.</p>}
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={busy} onClick={markSent}>
        {method === "cash" ? "I'll pay cash" : "I sent it"}
      </button>
    </div>
  );
}
