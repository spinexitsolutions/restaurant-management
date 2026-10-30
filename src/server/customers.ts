import "server-only";
import type { Order, Prisma, Restaurant } from "@prisma/client";
import { toPaise } from "@/lib/gst";
import { pointsEarned, type LoyaltySettings } from "@/lib/loyalty";
import { OrderError } from "./orders";

type Tx = Prisma.TransactionClient;

export const PHONE = /^[6-9]\d{9}$/;

export function loyaltySettings(r: Pick<Restaurant, "loyaltyEarnPer100" | "loyaltyPointValue" | "loyaltyMinRedeem">): LoyaltySettings {
  return { earnPer100: Number(r.loyaltyEarnPer100), pointValue: Number(r.loyaltyPointValue), minRedeem: r.loyaltyMinRedeem };
}

export async function upsertCustomer(tx: Tx, restaurantId: string, phone: string, name?: string | null) {
  if (!PHONE.test(phone)) throw new OrderError("Enter a 10-digit mobile number");
  return tx.customer.upsert({
    where: { restaurantId_phone: { restaurantId, phone } },
    update: name ? { name } : {},
    create: { restaurantId, phone, name: name || null },
  });
}

/** At billing: link the customer and take any redeemed points from their balance. */
export async function onBilled(tx: Tx, order: Order) {
  let customerId = order.customerId;
  if (!customerId && order.customerPhone && PHONE.test(order.customerPhone)) {
    customerId = (await upsertCustomer(tx, order.restaurantId, order.customerPhone, order.customerName)).id;
    await tx.order.update({ where: { id: order.id }, data: { customerId } });
  }
  if (order.pointsRedeemed > 0 && !order.pointsDeducted) {
    if (!customerId) throw new OrderError("Add the customer's mobile number to redeem points");
    const taken = await tx.customer.updateMany({
      where: { id: customerId, points: { gte: order.pointsRedeemed } },
      data: { points: { decrement: order.pointsRedeemed } },
    });
    if (!taken.count) throw new OrderError("The customer no longer has enough points. Remove the redemption and try again.");
    await tx.loyaltyTransaction.create({ data: { customerId, orderId: order.id, type: "REDEEM", points: -order.pointsRedeemed } });
    await tx.order.update({ where: { id: order.id }, data: { pointsDeducted: true } });
  }
}

/** Gives back redeemed points when a bill is reopened or cancelled. */
export async function refundPoints(tx: Tx, order: Order) {
  if (!order.pointsDeducted || !order.customerId || order.pointsRedeemed <= 0) return;
  await tx.customer.update({ where: { id: order.customerId }, data: { points: { increment: order.pointsRedeemed } } });
  await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, orderId: order.id, type: "REFUND", points: order.pointsRedeemed } });
  await tx.order.update({ where: { id: order.id }, data: { pointsDeducted: false } });
}

/** When fully paid: count the visit and award points. */
export async function onPaid(tx: Tx, order: Order) {
  if (!order.customerId) return;
  const r = await tx.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });
  const total = toPaise(order.grandTotal ?? 0);
  const earned = r.loyaltyEnabled ? pointsEarned(total, loyaltySettings(r)) : 0;
  await tx.customer.update({
    where: { id: order.customerId },
    data: { visits: { increment: 1 }, totalSpent: { increment: total / 100 }, lastVisitAt: new Date(), points: { increment: earned } },
  });
  if (earned > 0) {
    await tx.loyaltyTransaction.create({ data: { customerId: order.customerId, orderId: order.id, type: "EARN", points: earned } });
    await tx.order.update({ where: { id: order.id }, data: { pointsEarned: earned } });
  }
}
