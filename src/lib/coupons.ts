// Coupon rules. Money in paise; PERCENT coupons store the percent in `value`.

export interface CouponRule {
  code: string;
  type: "PERCENT" | "FLAT";
  value: number; // percent, or paise for FLAT
  maxDiscount: number | null; // paise
  minBill: number; // paise
  validFrom: Date | null;
  validTo: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
}

export interface CouponContext {
  now: Date;
  subtotal: number; // paise, before discounts
  usedTotal: number;
  customer: { visits: number; usedThisCoupon: number } | null;
}

export function normaliseCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export const CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;

/** Why the coupon can't be used, or null when it can. */
export function couponProblem(c: CouponRule, ctx: CouponContext): string | null {
  if (!c.isActive) return `${c.code} is no longer active`;
  if (c.validFrom && ctx.now < c.validFrom) return `${c.code} starts on ${c.validFrom.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`;
  if (c.validTo && ctx.now > c.validTo) return `${c.code} has expired`;
  if (c.usageLimit !== null && ctx.usedTotal >= c.usageLimit) return `${c.code} has been fully used`;
  if (ctx.subtotal < c.minBill) return `${c.code} needs a bill of at least ₹${Math.ceil(c.minBill / 100)}`;
  if (c.firstOrderOnly || c.perCustomerLimit !== null) {
    if (!ctx.customer) return `Add the customer's mobile number to use ${c.code}`;
    if (c.firstOrderOnly && ctx.customer.visits > 0) return `${c.code} is only for a customer's first order`;
    if (c.perCustomerLimit !== null && ctx.customer.usedThisCoupon >= c.perCustomerLimit) return `This customer has already used ${c.code}`;
  }
  return null;
}

/** Discount in paise for a subtotal (never more than the subtotal). */
export function couponDiscount(c: Pick<CouponRule, "type" | "value" | "maxDiscount">, subtotal: number): number {
  const raw = c.type === "PERCENT" ? Math.round((subtotal * Math.min(c.value, 100)) / 100) : c.value;
  const capped = c.maxDiscount !== null ? Math.min(raw, c.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

export function describeCoupon(c: Pick<CouponRule, "type" | "value" | "maxDiscount" | "minBill">) {
  const off = c.type === "PERCENT" ? `${c.value}% off` : `₹${c.value / 100} off`;
  const cap = c.type === "PERCENT" && c.maxDiscount ? ` up to ₹${c.maxDiscount / 100}` : "";
  const min = c.minBill ? ` on bills over ₹${c.minBill / 100}` : "";
  return off + cap + min;
}
