// Decides how a restaurant collects online payment:
//   RAZORPAY  - owner saved Razorpay API keys (cards, UPI, wallets, auto-confirmation)
//   UPI_QR    - no Razorpay keys, but a UPI ID is set: show a plain UPI QR with the amount
//   NONE      - neither is configured: cash/card at counter only

export type OnlinePaymentMode = "RAZORPAY" | "UPI_QR" | "NONE";

export function getOnlinePaymentMode(r: {
  razorpayKeyId: string | null;
  razorpayKeySecretEnc: string | null;
  upiId: string | null;
}): OnlinePaymentMode {
  if (r.razorpayKeyId && r.razorpayKeySecretEnc) return "RAZORPAY";
  if (r.upiId) return "UPI_QR";
  return "NONE";
}

/** UPI deep link (NPCI spec). Any UPI app can scan a QR of this string. */
export function buildUpiLink(opts: { upiId: string; payeeName: string; amountPaise?: number; note?: string }): string {
  const params = new URLSearchParams({ pa: opts.upiId, pn: opts.payeeName, cu: "INR" });
  if (opts.amountPaise) params.set("am", (opts.amountPaise / 100).toFixed(2));
  if (opts.note) params.set("tn", opts.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

/** Checks Razorpay credentials by making an authenticated read-only API call. */
export async function verifyRazorpayKeys(keyId: string, keySecret: string): Promise<boolean> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  return res.ok;
}
