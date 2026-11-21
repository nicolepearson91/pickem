/** Name matching used to stop people accidentally joining twice. */

/** "Big Mike", "bigmike" and "Big-Mike!" all squash to "bigmike". */
export function squash(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Same name once spaces, capitals and punctuation are ignored. Treated as taken. */
export function sameName(a: string, b: string) {
  const x = squash(a);
  return x.length > 0 && x === squash(b);
}

/** Close enough that it might be the same person: same first word, or one or two letters off. */
export function looksAlike(a: string, b: string) {
  const x = squash(a), y = squash(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const first = (s: string) => squash(s.trim().split(/\s+/)[0] ?? "");
  const fa = first(a), fb = first(b);
  if (fa.length >= 3 && fa === fb) return true;
  if (Math.min(x.length, y.length) >= 4 && distance(x, y) <= (Math.min(x.length, y.length) >= 7 ? 2 : 1)) return true;
  return x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x));
}
