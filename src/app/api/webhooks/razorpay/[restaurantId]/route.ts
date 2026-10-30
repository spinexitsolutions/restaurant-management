import { after, NextResponse, type NextRequest } from "next/server";
import { notifyBillPaid } from "@/server/whatsapp";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { OrderError, recordPayment } from "@/server/orders";

/**
 * Razorpay webhook (event: payment.captured). Set this URL in the restaurant's Razorpay dashboard:
 *   https://<your-domain>/api/webhooks/razorpay/<restaurantId>
 * It records payments even when the customer closes the page before Checkout returns.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { razorpayWebhookSecretEnc: true } });
  if (!restaurant?.razorpayWebhookSecretEnc) return NextResponse.json({ error: "not configured" }, { status: 404 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature, decrypt(restaurant.razorpayWebhookSecretEnc))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  if (event.event !== "payment.captured") return NextResponse.json({ ok: true });
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.notes?.orderId;
  if (!payment || !orderId) return NextResponse.json({ ok: true });

  try {
    await recordPayment(restaurantId, orderId, {
      method: "RAZORPAY",
      amountPaise: payment.amount,
      reference: payment.id,
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
    });
    after(() => notifyBillPaid(orderId));
  } catch (e) {
    // Already paid / not billed: acknowledge so Razorpay stops retrying.
    if (!(e instanceof OrderError)) throw e;
  }
  return NextResponse.json({ ok: true });
}
