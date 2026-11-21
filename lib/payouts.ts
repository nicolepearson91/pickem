/** Splits a pot between the top finishers. Tied players share the prizes for the places they cover. */
export interface PayoutRow { user_id: string; display_name: string; place: number; amount: number }

export function prizeList(pot: number, secondPct: number): number[] {
  const pct = Math.min(50, Math.max(0, Math.round(secondPct || 0)));
  if (pct === 0) return [pot];
  const second = Math.round(pot * pct) / 100;
  return [Math.round((pot - second) * 100) / 100, second];
}

export function computePayouts(
  standings: { user_id: string; display_name: string; place: number }[],
  pot: number,
  secondPct = 0,
): PayoutRow[] {
  if (pot <= 0 || standings.length === 0) return [];
  const sorted = [...standings].sort((a, b) => a.place - b.place);
  // With only one player there's no 2nd place, so they get it all.
  const prizes = sorted.length < 2 ? [pot] : prizeList(pot, secondPct);
  const out: PayoutRow[] = [];
  let pos = 0;
  while (pos < prizes.length && pos < sorted.length) {
    const group = sorted.filter((r) => r.place === sorted[pos].place);
    // Everyone tied here shares the prizes for positions pos .. pos + group size - 1.
    const share = prizes.slice(pos, pos + group.length).reduce((s, n) => s + n, 0);
    const cents = Math.round(share * 100);
    const each = Math.floor(cents / group.length);
    let extra = cents - each * group.length;
    for (const r of group) {
      const c = each + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      out.push({ user_id: r.user_id, display_name: r.display_name, place: r.place, amount: c / 100 });
    }
    pos += group.length;
  }
  return out.filter((r) => r.amount > 0);
}
