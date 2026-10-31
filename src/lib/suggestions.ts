// "Goes well with" suggestions: the owner's own pairings first, then dishes customers often order together.

export function buildSuggestions(
  items: { id: string; pairsWith: string[]; available: boolean }[],
  together: { a: string; b: string; orders: number }[], // dishes appearing in the same order
  limit = 3,
  minOrders = 2,
): Map<string, string[]> {
  const ok = new Set(items.filter((i) => i.available).map((i) => i.id));
  const out = new Map<string, string[]>();
  for (const item of items) {
    const picks = item.pairsWith.filter((id) => id !== item.id && ok.has(id));
    const learned = together
      .filter((t) => (t.a === item.id || t.b === item.id) && t.orders >= minOrders)
      .map((t) => ({ id: t.a === item.id ? t.b : t.a, orders: t.orders }))
      .sort((x, y) => y.orders - x.orders)
      .map((t) => t.id);
    for (const id of learned) if (id !== item.id && ok.has(id) && !picks.includes(id)) picks.push(id);
    if (picks.length) out.set(item.id, picks.slice(0, limit));
  }
  return out;
}
