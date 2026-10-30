"use server";

import { revalidatePath } from "next/cache";
import { requireRestaurantSession } from "@/lib/auth";
import { OrderError } from "@/server/orders";
import { confirmCheckout, startCheckout } from "@/server/subscriptions";
import type { CheckoutResponse } from "@/lib/client/razorpay-checkout";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't reach the payment gateway. Please try again." };
  }
}

export async function startSubscription(planCode: string) {
  const s = await requireRestaurantSession(["OWNER"]);
  return run(() => startCheckout(s.restaurantId, planCode));
}

export async function confirmSubscription(resp: CheckoutResponse) {
  const s = await requireRestaurantSession(["OWNER"]);
  const res = await run(async () => {
    const p = await confirmCheckout(s.restaurantId, resp);
    return { invoiceId: p.id };
  });
  revalidatePath("/dashboard", "layout");
  return res;
}
