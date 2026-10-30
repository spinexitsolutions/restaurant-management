import { describe, expect, it } from "vitest";
import { buildUpiLink, getOnlinePaymentMode, UPI_ID_PATTERN } from "./payments";

describe("getOnlinePaymentMode", () => {
  it("prefers Razorpay once both keys are saved", () => {
    expect(getOnlinePaymentMode({ razorpayKeyId: "rzp_test_x", razorpayKeySecretEnc: "enc", upiId: "a@okicici" })).toBe("RAZORPAY");
  });
  it("falls back to a UPI QR without Razorpay keys", () => {
    expect(getOnlinePaymentMode({ razorpayKeyId: "rzp_test_x", razorpayKeySecretEnc: null, upiId: "a@okicici" })).toBe("UPI_QR");
  });
  it("returns NONE when nothing is configured", () => {
    expect(getOnlinePaymentMode({ razorpayKeyId: null, razorpayKeySecretEnc: null, upiId: null })).toBe("NONE");
  });
});

describe("buildUpiLink", () => {
  it("encodes payee, amount and note", () => {
    const link = buildUpiLink({ upiId: "cafe@okhdfc", payeeName: "Chai & Co", amountPaise: 12550, note: "Table T4" });
    const params = new URL(link.replace("upi://pay", "http://x")).searchParams;
    expect(params.get("pa")).toBe("cafe@okhdfc");
    expect(params.get("pn")).toBe("Chai & Co");
    expect(params.get("am")).toBe("125.50");
    expect(params.get("tn")).toBe("Table T4");
  });
  it("validates UPI IDs", () => {
    expect(UPI_ID_PATTERN.test("9876543210@paytm")).toBe(true);
    expect(UPI_ID_PATTERN.test("not-an-upi")).toBe(false);
  });
});
