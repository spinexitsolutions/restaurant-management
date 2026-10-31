// Pickup state of a counter token, from its kitchen items. Pure, shared by the TV display and POS.

export type TokenState = "PREPARING" | "READY" | "COLLECTED";

export interface TokenItem {
  status: "NEW" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  held: boolean;
  updatedAt: Date;
}

/**
 * PREPARING while anything is still cooking (or held for a later course), READY once everything
 * is ready and at least one item hasn't been handed over, COLLECTED when all are served.
 * Orders with no live items (all cancelled / awaiting approval) are treated as COLLECTED.
 */
export function tokenState(items: TokenItem[]): { state: TokenState; readyAt: Date | null } {
  const live = items.filter((i) => i.status !== "CANCELLED");
  if (!live.length) return { state: "COLLECTED", readyAt: null };
  if (live.some((i) => i.held || i.status === "NEW" || i.status === "PREPARING")) return { state: "PREPARING", readyAt: null };
  if (live.some((i) => i.status === "READY")) {
    const readyAt = new Date(Math.max(...live.filter((i) => i.status === "READY").map((i) => i.updatedAt.getTime())));
    return { state: "READY", readyAt };
  }
  return { state: "COLLECTED", readyAt: null };
}

/** Ready tokens leave the TV after this long even if nobody tapped "Handed over". */
export const READY_SHOWN_MINUTES = 20;
