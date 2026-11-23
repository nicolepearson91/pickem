"use client";

import { useEffect, useState } from "react";
import { pushPublicKey, removePushSubscription, savePushSubscription, sendTestPush } from "@/app/notifications/actions";

type State = "loading" | "unsupported" | "needs-home-screen" | "off" | "on" | "blocked" | "not-ready";

function toBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Turn on payment alerts" for the admin's phone or computer. */
export default function PushToggle({ ready, forAdmin = true, banner = false }: { ready: boolean; forAdmin?: boolean; banner?: boolean }) {
  const what = forAdmin ? "payment alerts" : "alerts";
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem("pickem-alerts-dismissed") === "1"); } catch { setDismissed(false); }
  }, []);

  useEffect(() => {
    (async () => {
      if (!ready) return setState("not-ready");
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "needs-home-screen" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [ready]);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "blocked" : "off"); return; }
      const { key } = await pushPublicKey();
      if (!key) { setState("not-ready"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
      const r = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!r.ok) { setMsg(r.error); return; }
      setState("on");
      await sendTestPush();
      setMsg("Done! You should see a test notification now.");
    } catch (e) {
      setMsg(`Couldn't turn them on: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
    setMsg(null);
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const { sent } = await sendTestPush();
    setMsg(sent ? "Sent. It should pop up in a few seconds." : "Nothing was sent. Try turning alerts off and on again.");
    setBusy(false);
  }

  // On the home page, only show up when there's something to do, and never after "Not now".
  if (banner && (dismissed || ((state === "loading" || state === "on" || state === "unsupported" || state === "not-ready") && !msg))) return null;
  const body = (
    <div className="space-y-2 text-sm">
      {state === "loading" && <p className="text-slate-400">Checking this device…</p>}
      {state === "not-ready" && <p className="text-amber-300">{forAdmin ? "Run the notifications setup SQL in Supabase to turn this on." : "Not available yet. The pool admin needs to finish setup."}</p>}
      {state === "needs-home-screen" && (
        <p className="text-slate-300">
          On iPhone, alerts only work from the home screen app. In Safari tap the Share button, then <strong>Add to Home Screen</strong>.
          Open Pick Em from that icon, sign in, and come back here.
        </p>
      )}
      {state === "unsupported" && <p className="text-slate-400">This browser can&apos;t show notifications. Try the home screen app on your phone, or Chrome.</p>}
      {state === "blocked" && (
        <p className="text-amber-300">
          Notifications are blocked for Pick Em on this device. Turn them on in your phone&apos;s Settings, under Notifications, then Pick Em, and reload.
        </p>
      )}
      {state === "off" && <button className="btn-primary" disabled={busy} onClick={turnOn}>{busy ? "One sec…" : `🔔 Turn on ${what} on this device`}</button>}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-emerald-400">🔔 {forAdmin ? "Payment alerts are" : "Alerts are"} on for this device</span>
          <button className="btn-ghost" disabled={busy} onClick={test}>Send a test</button>
          <button className="btn-ghost" disabled={busy} onClick={turnOff}>Turn off</button>
        </div>
      )}
      {msg && <p className="text-slate-300">{msg}</p>}
    </div>
  );
  if (!banner) return body;
  return (
    <div className="card space-y-2 border-emerald-500/40">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white">Get a heads-up when a new week is posted</p>
        <button className="text-xs text-slate-400 underline" onClick={() => {
          setDismissed(true);
          try { localStorage.setItem("pickem-alerts-dismissed", "1"); } catch { /* private mode */ }
        }}>Not now</button>
      </div>
      {body}
      <p className="text-xs text-slate-500">You can also turn this on later from your Account page (tap your name at the top).</p>
    </div>
  );
}
