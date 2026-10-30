// Loyalty maths. Money in paise, points are whole numbers.

export interface LoyaltySettings {
  earnPer100: number; // points per ₹100 billed
  pointValue: number; // ₹ per point
  minRedeem: number; // smallest redemption allowed
}

export function pointsEarned(billPaise: number, s: LoyaltySettings): number {
  return Math.max(0, Math.floor((billPaise / 10000) * s.earnPer100));
}

export function redeemValuePaise(points: number, s: LoyaltySettings): number {
  return Math.round(points * s.pointValue * 100);
}

/** Most points usable on a bill: limited by balance and by the bill amount they can cover. */
export function maxRedeemable(balance: number, payablePaise: number, s: LoyaltySettings): number {
  if (s.pointValue <= 0) return 0;
  const byBill = Math.floor(payablePaise / (s.pointValue * 100));
  const max = Math.min(balance, byBill);
  return max >= s.minRedeem ? max : 0;
}

/** Returns an error message, or null if `points` can be redeemed. */
export function checkRedemption(points: number, balance: number, payablePaise: number, s: LoyaltySettings): string | null {
  if (!Number.isInteger(points) || points <= 0) return "Enter the points to redeem";
  if (points < s.minRedeem) return `At least ${s.minRedeem} points can be redeemed at a time`;
  if (points > balance) return `Customer has only ${balance} points`;
  if (redeemValuePaise(points, s) > payablePaise) return "Points are worth more than the bill";
  return null;
}
