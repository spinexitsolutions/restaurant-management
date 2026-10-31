// "We miss you" campaigns: customers who haven't been back for `days` get one message per lapse.

export interface WinbackCustomer {
  visits: number;
  lastVisitAt: Date | null;
  lastWinbackAt: Date | null;
  marketingOptOut: boolean;
}

export function winbackDue(c: WinbackCustomer, now: Date, days: number): boolean {
  if (c.marketingOptOut || c.visits < 1 || !c.lastVisitAt) return false;
  if (now.getTime() - c.lastVisitAt.getTime() < days * 86_400_000) return false;
  // Only one message per absence: a new message needs a visit after the previous one.
  return !c.lastWinbackAt || c.lastWinbackAt < c.lastVisitAt;
}

/** Customers messaged in the window who have visited since. */
export function winbackReturned(cs: { lastVisitAt: Date | null; lastWinbackAt: Date | null }[]) {
  const sent = cs.filter((c) => c.lastWinbackAt);
  const back = sent.filter((c) => c.lastVisitAt && c.lastVisitAt > c.lastWinbackAt!);
  return { sent: sent.length, returned: back.length };
}
