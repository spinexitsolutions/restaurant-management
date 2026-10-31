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

const basic = (keyId: string, keySecret: string) => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

/** Single-use, fixed-amount UPI QR (Razorpay QR Codes API). Paid status arrives by webhook or polling. */
export async function createUpiQr(opts: { keyId: string; keySecret: string; amountPaise: number; name: string; description: string; notes: Record<string, string> }) {
  const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: { Authorization: basic(opts.keyId, opts.keySecret), "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "upi_qr",
      name: opts.name.slice(0, 40),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: opts.amountPaise,
      description: opts.description.slice(0, 100),
      close_by: Math.floor(Date.now() / 1000) + 30 * 60,
      notes: opts.notes,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Razorpay QR creation failed (${res.status})`);
  return (await res.json()) as { id: string; image_url: string; status: string };
}

/** Captured payments made on a QR code. */
export async function fetchQrPayments(opts: { keyId: string; keySecret: string; qrId: string }) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(opts.qrId)}/payments`, {
    headers: { Authorization: basic(opts.keyId, opts.keySecret) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Razorpay QR lookup failed (${res.status})`);
  const json = (await res.json()) as { items?: { id: string; amount: number; status: string }[] };
  return (json.items ?? []).filter((p) => p.status === "captured");
}

export interface WebhookPayment {
  orderId: string;
  paymentId: string;
  razorpayOrderId: string | null;
  amount: number;
  qrId: string | null;
}

/** Pulls our order id and the payment out of a payment.captured or qr_code.credited webhook. */
export function parsePaymentWebhook(event: {
  event?: string;
  payload?: {
    payment?: { entity?: { id: string; amount: number; order_id?: string | null; notes?: Record<string, string> | unknown[] } };
    qr_code?: { entity?: { id: string; notes?: Record<string, string> | unknown[] } };
  };
}): WebhookPayment | null {
  if (event.event !== "payment.captured" && event.event !== "qr_code.credited") return null;
  const payment = event.payload?.payment?.entity;
  if (!payment) return null;
  // Razorpay sends empty notes as [] rather than {}.
  const notesOf = (n: unknown) => (n && !Array.isArray(n) ? (n as Record<string, string>) : {});
  const qr = event.payload?.qr_code?.entity;
  const orderId = notesOf(payment.notes).orderId || notesOf(qr?.notes).orderId;
  if (!orderId) return null;
  return { orderId, paymentId: payment.id, razorpayOrderId: payment.order_id ?? null, amount: payment.amount, qrId: qr?.id ?? null };
}
