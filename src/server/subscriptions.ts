import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { financialYear } from "@/lib/numbering";
import { paiseToRupees } from "@/lib/order-bill";
import { findPlan, renewalPeriod, subscriptionTax, type PlanDef } from "@/lib/plans";
import { createRazorpayOrder, fetchRazorpayOrder, verifyPaymentSignature } from "@/lib/razorpay";
import { OrderError } from "./orders";

/** The platform's own business details and Razorpay account (not a restaurant's). */
export function platform() {
  return {
    name: process.env.PLATFORM_NAME || process.env.NEXT_PUBLIC_APP_NAME || "DineFlow",
    legalName: process.env.PLATFORM_LEGAL_NAME || process.env.PLATFORM_NAME || "DineFlow",
    gstin: process.env.PLATFORM_GSTIN || null,
    address: process.env.PLATFORM_ADDRESS || null,
    state: process.env.PLATFORM_STATE || null,
    email: process.env.PLATFORM_SUPPORT_EMAIL || null,
    phone: process.env.PLATFORM_SUPPORT_PHONE || null,
    keyId: process.env.PLATFORM_RAZORPAY_KEY_ID || null,
    keySecret: process.env.PLATFORM_RAZORPAY_KEY_SECRET || null,
  };
}

export const onlineRenewalAvailable = () => !!(platform().keyId && platform().keySecret);

async function nextInvoiceNumber(tx: Prisma.TransactionClient) {
  const fy = financialYear();
  const row = await tx.platformCounter.upsert({ where: { key: `sub:${fy}` }, update: { value: { increment: 1 } }, create: { key: `sub:${fy}`, value: 1 } });
  return `SUB/${fy}/${String(row.value).padStart(4, "0")}`;
}

/** Records a subscription payment and extends the outlet's plan. Safe to call twice for the same Razorpay payment. */
export async function applySubscription(
  restaurantId: string,
  plan: PlanDef,
  payment: { method: "RAZORPAY" | "MANUAL"; razorpayOrderId?: string; razorpayPaymentId?: string; amountPaise?: number; note?: string; months?: number },
) {
  return db.$transaction(async (tx) => {
    if (payment.razorpayPaymentId) {
      const existing = await tx.subscriptionPayment.findUnique({ where: { razorpayPaymentId: payment.razorpayPaymentId } });
      if (existing) return existing;
    }
    await tx.$executeRaw`SELECT 1 FROM "Restaurant" WHERE id = ${restaurantId} FOR UPDATE`;
    const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const months = payment.months ?? plan.months;
    const amount = payment.amountPaise ?? plan.pricePaise;
    const tax = subscriptionTax(amount, r.state, platform().state);
    // A renewal while still on trial starts now; paid time is never lost.
    const { start, end } = renewalPeriod(r.plan === "TRIAL" ? null : r.planExpiresAt, months);
    const record = await tx.subscriptionPayment.create({
      data: {
        restaurantId,
        planCode: plan.code,
        months,
        invoiceNumber: await nextInvoiceNumber(tx),
        amount: paiseToRupees(tax.amount),
        cgst: paiseToRupees(tax.cgst),
        sgst: paiseToRupees(tax.sgst),
        igst: paiseToRupees(tax.igst),
        total: paiseToRupees(tax.total),
        periodStart: start,
        periodEnd: end,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        method: payment.method,
        note: payment.note,
      },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { plan: "BASIC", planExpiresAt: end } });
    return record;
  });
}

export async function startCheckout(restaurantId: string, planCode: string) {
  const p = platform();
  if (!p.keyId || !p.keySecret) throw new OrderError("Online renewal is not set up yet. Please contact support.");
  const plan = findPlan(planCode);
  if (!plan) throw new OrderError("Unknown plan");
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, state: true, email: true, phone: true } });
  const tax = subscriptionTax(plan.pricePaise, r.state, p.state);
  const order = await createRazorpayOrder({
    keyId: p.keyId,
    keySecret: p.keySecret,
    amountPaise: tax.total,
    receipt: `sub-${restaurantId}`.slice(0, 40),
    notes: { purpose: "subscription", restaurantId, planCode: plan.code },
  });
  return { keyId: p.keyId, razorpayOrderId: order.id, amount: tax.total, name: p.name, description: `${plan.name} plan · ${r.name}`, email: r.email, phone: r.phone };
}

export async function confirmCheckout(restaurantId: string, resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const p = platform();
  if (!p.keyId || !p.keySecret) throw new OrderError("Online renewal is not set up");
  if (!verifyPaymentSignature({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature, keySecret: p.keySecret })) {
    throw new OrderError("Payment could not be verified. If money was deducted, contact support with your payment ID.");
  }
  const order = await fetchRazorpayOrder({ keyId: p.keyId, keySecret: p.keySecret, razorpayOrderId: resp.razorpay_order_id });
  const plan = findPlan(order.notes?.planCode ?? "");
  if (order.notes?.restaurantId !== restaurantId || order.notes?.purpose !== "subscription" || !plan) throw new OrderError("This payment is for a different account");
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { state: true } });
  if (order.amount_paid < subscriptionTax(plan.pricePaise, r.state, p.state).total) throw new OrderError("The payment amount doesn't match the plan");
  return applySubscription(restaurantId, plan, { method: "RAZORPAY", razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id });
}
