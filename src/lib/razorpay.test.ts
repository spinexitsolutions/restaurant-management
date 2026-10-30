import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";

describe("razorpay signatures", () => {
  const secret = "test_secret";
  it("accepts a valid checkout signature and rejects tampering", () => {
    const signature = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature, keySecret: secret })).toBe(true);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature, keySecret: secret })).toBe(false);
    expect(verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: "short", keySecret: secret })).toBe(false);
  });
  it("verifies webhook bodies", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", "wh").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, "wh")).toBe(true);
    expect(verifyWebhookSignature(body + " ", signature, "wh")).toBe(false);
  });
});
