"use server";

import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { getOnlinePaymentMode } from "@/lib/payments";
import { createRazorpayOrder, fetchRazorpayOrder, verifyPaymentSignature } from "@/lib/razorpay";
import { createServiceRequest, OrderError, placeItems, recordPayment } from "@/server/orders";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0].message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please call the waiter." };
  }
}

const placeSchema = z.object({
  slug: z.string(),
  tableToken: z.string().min(1),
  customerName: z.string().max(60).optional(),
  note: z.string().max(200).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string(),
        variantId: z.string().nullable(),
        addonIds: z.array(z.string()).max(30),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1, "Your cart is empty")
    .max(30),
});

/** Customer places an order from the table QR. Staff must accept it unless auto-accept is on. */
export async function placeQrOrder(input: z.input<typeof placeSchema>) {
  return run(async () => {
    const d = placeSchema.parse(input);
    const restaurant = await db.restaurant.findUnique({ where: { slug: d.slug } });
    if (!restaurant || !restaurant.isActive || !restaurant.qrOrderingEnabled) throw new OrderError("Ordering from the menu is not available here");
    const table = await db.diningTable.findFirst({ where: { qrToken: d.tableToken, restaurantId: restaurant.id } });
    if (!table) throw new OrderError("This QR code is no longer valid. Please ask the staff.");

    // Basic flood protection: cap unapproved tickets per table.
    const waiting = await db.kot.count({ where: { status: "PENDING_APPROVAL", order: { tableId: table.id } } });
    if (waiting >= 3) throw new OrderError("Your previous orders are waiting for staff confirmation.");

    const { order } = await placeItems({
      restaurantId: restaurant.id,
      newOrder: { type: "DINE_IN", tableId: table.id, source: "QR", customerName: d.customerName },
      lines: d.lines,
      kotStatus: restaurant.autoAcceptQrOrders ? "ACCEPTED" : "PENDING_APPROVAL",
      createdById: null,
      note: d.note,
    });
    return { token: order.publicToken };
  });
}

async function orderByToken(token: string) {
  const order = await db.order.findUnique({ where: { publicToken: token }, include: { restaurant: true } });
  if (!order) throw new OrderError("Order not found");
  return order;
}

export async function requestService(token: string, type: "CALL_WAITER" | "REQUEST_BILL" | "WATER") {
  return run(async () => {
    const order = await orderByToken(token);
    if (!order.tableId || order.status === "PAID" || order.status === "CANCELLED") throw new OrderError("This order is closed");
    await createServiceRequest(order.restaurantId, order.tableId, z.enum(["CALL_WAITER", "REQUEST_BILL", "WATER"]).parse(type));
  });
}

/** Creates a Razorpay order for the amount still due on a billed order. */
export async function startRazorpayPayment(token: string) {
  return run(async () => {
    const order = await orderByToken(token);
    const r = order.restaurant;
    if (getOnlinePaymentMode(r) !== "RAZORPAY") throw new OrderError("Online payment is not set up");
    if (order.status !== "BILLED") throw new OrderError(order.status === "PAID" ? "Already paid" : "Your bill is not ready yet");
    const paid = await db.payment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
    const due = toPaise(order.grandTotal!) - toPaise(paid._sum.amount ?? 0);
    if (due <= 0) throw new OrderError("Nothing is due");
    const keySecret = decrypt(r.razorpayKeySecretEnc!);
    const rzp = await createRazorpayOrder({
      keyId: r.razorpayKeyId!,
      keySecret,
      amountPaise: due,
      receipt: order.invoiceNumber ?? order.id,
      notes: { orderId: order.id, restaurantId: r.id },
    });
    return { keyId: r.razorpayKeyId!, razorpayOrderId: rzp.id, amount: due, name: r.name, description: order.invoiceNumber ?? `Order ${order.orderNumber}` };
  });
}

const confirmSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

/** Called by Razorpay Checkout's success handler; the signature proves the payment is genuine. */
export async function confirmRazorpayPayment(token: string, input: z.input<typeof confirmSchema>) {
  return run(async () => {
    const d = confirmSchema.parse(input);
    const order = await orderByToken(token);
    const keySecret = decrypt(order.restaurant.razorpayKeySecretEnc!);
    if (!verifyPaymentSignature({ orderId: d.razorpay_order_id, paymentId: d.razorpay_payment_id, signature: d.razorpay_signature, keySecret })) {
      throw new OrderError("Payment could not be verified. If money was deducted, show this screen to the staff.");
    }
    // Take the amount from Razorpay, and make sure that Razorpay order was created for this bill.
    const rzpOrder = await fetchRazorpayOrder({ keyId: order.restaurant.razorpayKeyId!, keySecret, razorpayOrderId: d.razorpay_order_id });
    if (rzpOrder.notes?.orderId !== order.id) throw new OrderError("This payment belongs to a different order");
    await recordPayment(order.restaurantId, order.id, {
      method: "RAZORPAY",
      amountPaise: rzpOrder.amount_paid,
      reference: d.razorpay_payment_id,
      razorpayOrderId: d.razorpay_order_id,
      razorpayPaymentId: d.razorpay_payment_id,
    });
  });
}

/** Public booking request from /m/[slug]/book. Staff confirm it in Reservations. */
export async function requestBooking(_: { ok?: boolean; error?: string } | null, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { createReservation, reservationSchema } = await import("@/server/reservations");
  const restaurant = await db.restaurant.findUnique({ where: { slug: String(formData.get("slug")) }, select: { id: true, isActive: true, reservationsEnabled: true } });
  if (!restaurant?.isActive || !restaurant.reservationsEnabled) return { error: "Online booking isn't available" };
  const parsed = reservationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await run(() => createReservation(restaurant.id, parsed.data, "ONLINE"));
  return res.ok ? { ok: true } : { error: res.error };
}
