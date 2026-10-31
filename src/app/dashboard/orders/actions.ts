"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyBillPaid } from "@/server/whatsapp";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { toPaise } from "@/lib/gst";
import { approve, audit } from "@/server/approval";
import { db } from "@/lib/db";
import {
  advanceItems,
  BILLING_ROLES,
  cancelItem,
  cancelOrder,
  decideKot,
  generateBill,
  KITCHEN_ROLES,
  ORDER_ROLES,
  OrderError,
  placeItems,
  recordPayment,
  reopenBill,
  resolveServiceRequest,
  setDiscount,
  fireNextCourse,
  redeemPoints,
  setOrderBuyer,
  setOrderCustomer,
  splitOrder,
  transferOrder,
  mergeOrders,
} from "@/server/orders";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/dashboard", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    throw e;
  }
}

const lineSchema = z.object({
  itemId: z.string().min(1),
  variantId: z.string().nullable(),
  addonIds: z.array(z.string()).max(30),
  quantity: z.number().int().min(1).max(99),
  note: z.string().max(140).optional(),
});

const sendKotSchema = z.object({
  orderId: z.string().optional(),
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
  tableId: z.string().nullable().optional(),
  customerName: z.string().max(60).optional(),
  customerPhone: z.union([z.literal(""), z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")]).optional(),
  channel: z.enum(["ZOMATO", "SWIGGY"]).nullable().optional(),
  channelRef: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item").max(50),
  clientRequestId: z.string().max(64).optional(),
});

/** Staff sends items to the kitchen; creates the order on the first KOT. */
export async function sendKot(input: z.input<typeof sendKotSchema>): Promise<ActionResult<{ orderId: string }>> {
  const session = await requireRestaurantSession(ORDER_ROLES);
  return run(async () => {
    const d = sendKotSchema.parse(input);
    const { order } = await placeItems({
      restaurantId: session.restaurantId,
      orderId: d.orderId,
      newOrder: {
        type: d.type,
        tableId: d.tableId ?? null,
        source: "STAFF",
        waiterId: session.userId,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        channel: d.channel ?? null,
        channelRef: d.channelRef,
      },
      lines: d.lines,
      kotStatus: "ACCEPTED",
      createdById: session.userId,
      note: d.note,
      clientRequestId: d.clientRequestId,
    });
    return { orderId: order.id };
  });
}

export async function acceptKot(kotId: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => decideKot(s.restaurantId, kotId, true));
}

export async function rejectKot(kotId: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(async () => {
    const kot = await db.kot.findFirst({ where: { id: kotId, restaurantId: s.restaurantId }, select: { orderId: true, kotNumber: true } });
    await decideKot(s.restaurantId, kotId, false);
    await audit({ restaurantId: s.restaurantId, actor: s, action: "KOT_REJECTED", orderId: kot?.orderId, details: { kotNumber: kot?.kotNumber } });
  });
}

/** Kitchen moves items NEW -> PREPARING -> READY. */
export async function kitchenAdvance(itemIds: string[], to?: "PREPARING" | "READY") {
  const s = await requireRestaurantSession(KITCHEN_ROLES);
  return run(() => advanceItems(s.restaurantId, itemIds, to));
}

/** Floor staff mark items served. */
export async function markServed(itemIds: string[]) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => advanceItems(s.restaurantId, itemIds, "SERVED"));
}

export async function cancelOrderItem(itemId: string, reason: string, pin?: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(async () => {
    const item = await db.orderItem.findFirst({ where: { id: itemId, order: { restaurantId: s.restaurantId } } });
    if (!item) throw new OrderError("Item not found");
    // Removing something the kitchen already started costs money, so it needs approval.
    const approvedBy = item.status === "NEW" ? null : await approve(s, pin);
    // A manager-approved cancellation is allowed even for a waiter.
    await cancelItem(s.restaurantId, itemId, reason, approvedBy ? "MANAGER" : s.role);
    await audit({
      restaurantId: s.restaurantId,
      actor: s,
      approvedBy,
      action: "ITEM_CANCELLED",
      orderId: item.orderId,
      details: { item: item.name, quantity: item.quantity, amount: Number(item.unitPrice) * item.quantity, status: item.status, reason },
    });
  });
}

export async function applyDiscount(orderId: string, type: "PERCENT" | "FLAT", value: number, note: string, pin?: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    const approvedBy = value > 0 ? await approve(s, pin) : null;
    await setDiscount(s.restaurantId, orderId, value > 0 ? { type, value, note } : null);
    await audit({ restaurantId: s.restaurantId, actor: s, approvedBy, action: value > 0 ? "DISCOUNT_APPLIED" : "DISCOUNT_REMOVED", orderId, details: { type, value, note } });
  });
}

export async function billOrder(orderId: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    await generateBill(s.restaurantId, orderId);
  });
}

export async function reopenOrder(orderId: string, pin?: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    const approvedBy = await approve(s, pin);
    await reopenBill(s.restaurantId, orderId);
    await audit({ restaurantId: s.restaurantId, actor: s, approvedBy, action: "BILL_REOPENED", orderId });
  });
}

const paymentSchema = z.object({
  method: z.enum(["CASH", "UPI", "CARD", "AGGREGATOR", "OTHER"]),
  amount: z.number().positive("Enter an amount").max(10_000_000),
  reference: z.string().max(80).optional(),
  clientRequestId: z.string().max(64).optional(),
});

export async function takePayment(orderId: string, input: z.input<typeof paymentSchema>) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    const d = paymentSchema.parse(input);
    const order = await recordPayment(s.restaurantId, orderId, {
      method: d.method,
      amountPaise: toPaise(d.amount),
      reference: d.reference,
      receivedById: s.userId,
      clientRequestId: d.clientRequestId,
    });
    if (order.status === "PAID") after(() => notifyBillPaid(orderId));
    return { status: order.status };
  });
}

export async function cancelWholeOrder(orderId: string, reason: string, pin?: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    const approvedBy = await approve(s, pin);
    await cancelOrder(s.restaurantId, orderId, reason);
    await audit({ restaurantId: s.restaurantId, actor: s, approvedBy, action: "ORDER_CANCELLED", orderId, details: { reason } });
  });
}

export async function transferTable(orderId: string, toTableId: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(async () => {
    const moved = await transferOrder(s.restaurantId, orderId, toTableId);
    await audit({ restaurantId: s.restaurantId, actor: s, action: "TABLE_TRANSFERRED", orderId, details: moved });
  });
}

export async function mergeInto(targetOrderId: string, sourceOrderId: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(async () => {
    const merged = await mergeOrders(s.restaurantId, targetOrderId, sourceOrderId);
    await audit({ restaurantId: s.restaurantId, actor: s, action: "ORDERS_MERGED", orderId: targetOrderId, details: merged });
  });
}

export async function splitBill(orderId: string, parts: { itemId: string; quantity: number }[]) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    const split = await splitOrder(s.restaurantId, orderId, parts, s.userId);
    await audit({ restaurantId: s.restaurantId, actor: s, action: "BILL_SPLIT", orderId, details: { newOrder: split.orderNumber, parts } });
    return { orderId: split.id };
  });
}

export async function resolveRequest(id: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => resolveServiceRequest(s.restaurantId, id));
}

export async function setCustomer(orderId: string, phone: string, name: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => setOrderCustomer(s.restaurantId, orderId, phone.trim(), name));
}

export async function applyPoints(orderId: string, points: number) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    await redeemPoints(s.restaurantId, orderId, points);
    if (points > 0) await audit({ restaurantId: s.restaurantId, actor: s, action: "POINTS_REDEEMED", orderId, details: { points } });
  });
}

export async function setBuyer(orderId: string, gstin: string, name: string, address: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(() => setOrderBuyer(s.restaurantId, orderId, { gstin, name, address }));
}

export async function reprintOrder(orderId: string, kind: "KOT" | "BILL") {
  const s = await requireRestaurantSession(ORDER_ROLES);
  const { reprint } = await import("@/server/printing");
  return run(async () => {
    const n = await reprint(s.restaurantId, orderId, kind);
    if (!n) throw new OrderError("No printer is set up for this. Add one in Kitchen setup.");
    return { jobs: n };
  });
}

export async function fireCourse(orderId: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => fireNextCourse(s.restaurantId, orderId));
}

export async function showUpiQr(orderId: string, amount: number) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  const { createPosQr } = await import("@/server/upi-qr");
  return run(() => createPosQr(s.restaurantId, orderId, Math.round(amount * 100)));
}

export async function checkUpiQr(requestId: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  const { checkPosQr } = await import("@/server/upi-qr");
  try {
    return { ok: true as const, data: await checkPosQr(s.restaurantId, requestId) };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false as const, error: e.message };
    // Network hiccup talking to Razorpay: the next poll will try again.
    return { ok: false as const, error: "retry" };
  }
}
