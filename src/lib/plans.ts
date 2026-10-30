// SaaS plans and subscription maths. Prices are per outlet, before GST. Change them here.

export interface PlanDef {
  code: "MONTHLY" | "QUARTERLY" | "YEARLY";
  name: string;
  months: number;
  pricePaise: number;
  note?: string;
}

export const PLANS: PlanDef[] = [
  { code: "MONTHLY", name: "Monthly", months: 1, pricePaise: 99900 },
  { code: "QUARTERLY", name: "3 months", months: 3, pricePaise: 279900, note: "Save 7%" },
  { code: "YEARLY", name: "Yearly", months: 12, pricePaise: 999900, note: "2 months free" },
];

export const SAAS_GST_RATE = 18;
export const GRACE_DAYS = 3;

export function findPlan(code: string) {
  return PLANS.find((p) => p.code === code) ?? null;
}

/** Same state as the platform: CGST + SGST. Different state: IGST. Unknown state is treated as same state. */
export function subscriptionTax(amountPaise: number, customerState: string | null | undefined, platformState: string | null | undefined) {
  const tax = Math.round((amountPaise * SAAS_GST_RATE) / 100);
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const interState = !!norm(customerState) && !!norm(platformState) && norm(customerState) !== norm(platformState);
  const cgst = interState ? 0 : Math.floor(tax / 2);
  const sgst = interState ? 0 : tax - cgst;
  return { amount: amountPaise, cgst, sgst, igst: interState ? tax : 0, total: amountPaise + tax };
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/** A renewal starts when the current period ends, or now if it already lapsed. */
export function renewalPeriod(currentEnd: Date | null, months: number, now: Date = new Date()) {
  const start = currentEnd && currentEnd > now ? currentEnd : now;
  return { start, end: addMonths(start, months) };
}

export type SubState = "ACTIVE" | "GRACE" | "EXPIRED";

export function subscriptionStatus(expiresAt: Date | null, now: Date = new Date()): { state: SubState; daysLeft: number } {
  if (!expiresAt) return { state: "ACTIVE", daysLeft: Infinity };
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft > 0) return { state: "ACTIVE", daysLeft };
  if (daysLeft > -GRACE_DAYS) return { state: "GRACE", daysLeft };
  return { state: "EXPIRED", daysLeft };
}
