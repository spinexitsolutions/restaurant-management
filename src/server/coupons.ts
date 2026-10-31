import "server-only";
import type { Coupon, Prisma } from "@prisma/client";
import { couponDiscount, couponProblem, normaliseCode, type CouponRule } from "@/lib/coupons";
import { toPaise } from "@/lib/gst";

type Tx = Prisma.TransactionClient;

export function toRule(c: Coupon): CouponRule {
  return {
    code: c.code,
    type: c.type as "PERCENT" | "FLAT",
    value: c.type === "FLAT" ? toPaise(c.value) : Number(c.value),
    maxDiscount: c.maxDiscount === null ? null : toPaise(c.maxDiscount),
    minBill: toPaise(c.minBill),
    validFrom: c.validFrom,
    validTo: c.validTo,
    usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit,
    firstOrderOnly: c.firstOrderOnly,
    isActive: c.isActive,
  };
}

/** Customer on the order (linked, or found by the mobile number) for per-customer rules. */
async function orderCustomer(tx: Tx, restaurantId: string, order: { customerId: string | null; customerPhone: string | null }) {
  if (order.customerId) return tx.customer.findUnique({ where: { id: order.customerId } });
  if (order.customerPhone) return tx.customer.findUnique({ where: { restaurantId_phone: { restaurantId, phone: order.customerPhone } } });
  return null;
}

/**
 * Checks a coupon against an order's subtotal and returns the discount in paise, or throws a message.
 * `orderId` is excluded from usage counts so re-billing the same order doesn't count twice.
 */
export async function evaluateCoupon(
  tx: Tx,
  restaurantId: string,
  coupon: Coupon,
  order: { id: string; customerId: string | null; customerPhone: string | null },
  subtotal: number,
): Promise<{ discount: number } | { error: string }> {
  const customer = await orderCustomer(tx, restaurantId, order);
  const [usedTotal, usedThisCoupon] = await Promise.all([
    tx.couponRedemption.count({ where: { couponId: coupon.id, orderId: { not: order.id } } }),
    customer ? tx.couponRedemption.count({ where: { couponId: coupon.id, customerId: customer.id, orderId: { not: order.id } } }) : Promise.resolve(0),
  ]);
  const rule = toRule(coupon);
  // A mobile number with no customer record yet is a first-time guest.
  const who = customer ? { visits: customer.visits, usedThisCoupon } : order.customerPhone ? { visits: 0, usedThisCoupon: 0 } : null;
  const problem = couponProblem(rule, { now: new Date(), subtotal, usedTotal, customer: who });
  return problem ? { error: problem } : { discount: couponDiscount(rule, subtotal) };
}

export async function findCoupon(tx: Tx, restaurantId: string, code: string) {
  return tx.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code: normaliseCode(code) } } });
}
