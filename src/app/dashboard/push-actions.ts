"use server";

import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushToStaff } from "@/server/push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Stores this device's push subscription for the signed-in staff member and sends a test alert. */
export async function savePushSubscription(input: unknown) {
  const s = await requireRestaurantSession();
  const sub = subscriptionSchema.parse(input);
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: s.userId, restaurantId: s.restaurantId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId: s.userId, restaurantId: s.restaurantId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  await pushToStaff(s.restaurantId, { userIds: [s.userId] }, (t) => ({ title: t("push.test"), url: "/dashboard", tag: "test" }));
}

export async function removePushSubscription(endpoint: string) {
  const s = await requireRestaurantSession();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: s.userId } });
}
