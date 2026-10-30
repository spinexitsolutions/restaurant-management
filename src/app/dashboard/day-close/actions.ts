"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { paiseToRupees } from "@/lib/order-bill";
import { audit } from "@/server/approval";
import { daySummary } from "@/server/day-close";
import { BILLING_ROLES } from "@/server/orders";

export type FormState = { error?: string; ok?: string } | null;

const rupees = z.coerce.number().min(0, "Amount can't be negative").max(100_000_000);
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: rupees,
  countedCash: rupees,
  cashWithdrawn: rupees,
  note: z.string().trim().max(300),
});

export async function closeDay(_: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRestaurantSession(BILLING_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.date > istDate()) return { error: "You can't close a future day" };
  if (d.cashWithdrawn > d.countedCash) return { error: "Cash withdrawn can't be more than the cash counted" };
  if (await db.dayClose.findUnique({ where: { restaurantId_businessDate: { restaurantId: session.restaurantId, businessDate: d.date } } })) {
    return { error: "This day is already closed" };
  }

  const s = await daySummary(session.restaurantId, d.date);
  const opening = toPaise(d.openingCash);
  const counted = toPaise(d.countedCash);
  const expected = opening + s.cash;
  await db.dayClose.create({
    data: {
      restaurantId: session.restaurantId,
      businessDate: d.date,
      openingCash: paiseToRupees(opening),
      cashSales: paiseToRupees(s.cash),
      upiSales: paiseToRupees(s.upi),
      cardSales: paiseToRupees(s.card),
      onlineSales: paiseToRupees(s.online),
      otherSales: paiseToRupees(s.other),
      totalSales: paiseToRupees(s.total),
      cashWithdrawn: paiseToRupees(toPaise(d.cashWithdrawn)),
      expectedCash: paiseToRupees(expected),
      countedCash: paiseToRupees(counted),
      difference: paiseToRupees(counted - expected),
      ordersCount: s.ordersCount,
      note: d.note || null,
      closedById: session.userId,
      closedByName: session.name,
    },
  });
  await audit({
    restaurantId: session.restaurantId,
    actor: session,
    action: "DAY_CLOSED",
    details: { date: d.date, expected: paiseToRupees(expected), counted: paiseToRupees(counted), difference: paiseToRupees(counted - expected) },
  });
  revalidatePath("/dashboard/day-close");
  return { ok: "Day closed" };
}
