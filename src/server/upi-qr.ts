import "server-only";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { paiseToRupees } from "@/lib/order-bill";
import { getOnlinePaymentMode } from "@/lib/payments";
import { createUpiQr, fetchQrPayments } from "@/lib/razorpay";
import { OrderError, recordPayment } from "./orders";

async function keysFor(restaurantId: string) {
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  if (getOnlinePaymentMode(r) !== "RAZORPAY") throw new OrderError("Connect Razorpay in Settings to confirm UPI payments automatically");
  return { r, keyId: r.razorpayKeyId!, keySecret: decrypt(r.razorpayKeySecretEnc!) };
}

/** A fresh single-use UPI QR for this amount; it confirms itself when paid. */
export async function createPosQr(restaurantId: string, orderId: string, amountPaise: number) {
  const { r, keyId, keySecret } = await keysFor(restaurantId);
  const order = await db.order.findFirst({ where: { id: orderId, restaurantId }, include: { payments: true } });
  if (!order) throw new OrderError("Order not found");
  if (order.status !== "BILLED") throw new OrderError("Generate the bill first");
  const due = toPaise(order.grandTotal!) - order.payments.reduce((s, p) => s + toPaise(p.amount), 0);
  if (amountPaise < 100 || amountPaise > due) throw new OrderError(`Enter an amount up to ${paiseToRupees(due)}`);
  const qr = await createUpiQr({
    keyId,
    keySecret,
    amountPaise,
    name: r.name,
    description: order.invoiceNumber ?? `Order ${order.orderNumber}`,
    notes: { orderId: order.id, restaurantId },
  });
  await db.paymentRequest.updateMany({ where: { orderId, status: "OPEN" }, data: { status: "CLOSED" } });
  const req = await db.paymentRequest.create({ data: { orderId, qrId: qr.id, amount: paiseToRupees(amountPaise), imageUrl: qr.image_url } });
  return { requestId: req.id, imageUrl: req.imageUrl, amount: amountPaise };
}

/** Asks Razorpay whether the QR was paid and records it (safe to repeat; the webhook may have done it already). */
export async function checkPosQr(restaurantId: string, requestId: string) {
  const req = await db.paymentRequest.findFirst({ where: { id: requestId, order: { restaurantId } } });
  if (!req) throw new OrderError("Payment request not found");
  if (req.status === "PAID") return { paid: true, amount: toPaise(req.amount) };
  if (req.status === "CLOSED") return { paid: false, amount: toPaise(req.amount) };
  const { keyId, keySecret } = await keysFor(restaurantId);
  const payments = await fetchQrPayments({ keyId, keySecret, qrId: req.qrId });
  for (const p of payments) await recordQrPayment(restaurantId, req.orderId, req.qrId, p.id, p.amount);
  return { paid: payments.length > 0, amount: toPaise(req.amount) };
}

export async function recordQrPayment(restaurantId: string, orderId: string, qrId: string, paymentId: string, amountPaise: number) {
  await recordPayment(restaurantId, orderId, { method: "RAZORPAY", amountPaise, reference: `UPI QR ${paymentId}`, razorpayPaymentId: paymentId }).catch((e) => {
    // Already paid in full (e.g. cash taken meanwhile) still marks the QR as used below.
    if (!(e instanceof OrderError)) throw e;
  });
  await db.paymentRequest.updateMany({ where: { qrId, status: { not: "PAID" } }, data: { status: "PAID", paidAt: new Date() } });
}
