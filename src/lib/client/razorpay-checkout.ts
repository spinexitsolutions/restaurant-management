"use client";

// Loads Razorpay Checkout on demand and opens it.

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (e: unknown) => void): void };
  }
}

export interface CheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return true;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}
