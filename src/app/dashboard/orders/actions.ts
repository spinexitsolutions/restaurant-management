"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { toPaise } from "@/lib/gst";
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
  note: z.string().max(200).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item").max(50),
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
      },
      lines: d.lines,
      kotStatus: "ACCEPTED",
      createdById: session.userId,
      note: d.note,
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
  return run(() => decideKot(s.restaurantId, kotId, false));
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

export async function cancelOrderItem(itemId: string, reason: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => cancelItem(s.restaurantId, itemId, reason, s.role));
}

export async function applyDiscount(orderId: string, type: "PERCENT" | "FLAT", value: number, note: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(() => setDiscount(s.restaurantId, orderId, value > 0 ? { type, value, note } : null));
}

export async function billOrder(orderId: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(async () => {
    await generateBill(s.restaurantId, orderId);
  });
}

export async function reopenOrder(orderId: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(() => reopenBill(s.restaurantId, orderId));
}

const paymentSchema = z.object({
  method: z.enum(["CASH", "UPI", "CARD", "OTHER"]),
  amount: z.number().positive("Enter an amount").max(10_000_000),
  reference: z.string().max(80).optional(),
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
    });
    return { status: order.status };
  });
}

export async function cancelWholeOrder(orderId: string, reason: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  return run(() => cancelOrder(s.restaurantId, orderId, reason));
}

export async function resolveRequest(id: string) {
  const s = await requireRestaurantSession(ORDER_ROLES);
  return run(() => resolveServiceRequest(s.restaurantId, id));
}
