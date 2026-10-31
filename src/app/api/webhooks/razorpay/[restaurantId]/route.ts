import { after, NextResponse, type NextRequest } from "next/server";
import { notifyBillPaid } from "@/server/whatsapp";
import { decrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { parsePaymentWebhook, verifyWebhookSignature } from "@/lib/razorpay";
import { recordQrPayment } from "@/server/upi-qr";
import { OrderError, recordPayment } from "@/server/orders";

/**
 * Razorpay webhook (events: payment.captured, qr_code.credited). Set this URL in the restaurant's Razorpay dashboard:
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

  const paid = parsePaymentWebhook(JSON.parse(raw));
  if (!paid) return NextResponse.json({ ok: true });

  try {
    if (paid.qrId) await recordQrPayment(restaurantId, paid.orderId, paid.qrId, paid.paymentId, paid.amount);
    else
      await recordPayment(restaurantId, paid.orderId, {
        method: "RAZORPAY",
        amountPaise: paid.amount,
        reference: paid.paymentId,
        razorpayOrderId: paid.razorpayOrderId ?? undefined,
        razorpayPaymentId: paid.paymentId,
      });
    after(() => notifyBillPaid(paid.orderId));
  } catch (e) {
    // Already paid / not billed: acknowledge so Razorpay stops retrying.
    if (!(e instanceof OrderError)) throw e;
  }
  return NextResponse.json({ ok: true });
}
