import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout success handler signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(opts: { orderId: string; paymentId: string; signature: string; keySecret: string }): boolean {
  const expected = createHmac("sha256", opts.keySecret).update(`${opts.orderId}|${opts.paymentId}`).digest("hex");
  return safeEqual(expected, opts.signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

export async function createRazorpayOrder(opts: {
  keyId: string;
  keySecret: string;
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: opts.amountPaise, currency: "INR", receipt: opts.receipt.slice(0, 40), notes: opts.notes }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
  return res.json();
}

export async function fetchRazorpayOrder(opts: { keyId: string; keySecret: string; razorpayOrderId: string }) {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(opts.razorpayOrderId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64")}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Razorpay order fetch failed (${res.status})`);
  return (await res.json()) as { id: string; amount_paid: number; status: string; notes: Record<string, string> };
}
