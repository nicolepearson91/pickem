import type { PayMethod } from "./types.ts";

export const METHOD_LABEL: Record<PayMethod, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  applecash: "Apple Cash",
  cash: "Cash",
};

const clean = (s: string) => s.trim().replace(/^[@$]/, "");

/** Opens Venmo with the amount and note filled in. The player still taps Pay inside Venmo. */
export function venmoLink(handle: string, amount: number, note: string) {
  const p = new URLSearchParams({ txn: "pay", amount: amount.toFixed(2), note });
  return `https://venmo.com/${encodeURIComponent(clean(handle))}?${p}`;
}

/** Opens Cash App to the cashtag with the amount filled in. */
export function cashAppLink(tag: string, amount: number) {
  return "https://cash.app/$" + encodeURIComponent(clean(tag)) + "/" + amount.toFixed(2);
}

export function money(n: number) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The pot: money the admin has confirmed, plus money players say they sent but isn't confirmed yet. */
export function potTotals(payments: { status: string }[], fee: number) {
  const paid = payments.filter((p) => p.status === "verified").length;
  const pending = payments.filter((p) => p.status !== "verified").length;
  return { paid, pending, pot: paid * Number(fee), pendingAmount: pending * Number(fee) };
}
