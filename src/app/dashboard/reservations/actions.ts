"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyBooking } from "@/server/whatsapp";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { bumpLive, ORDER_ROLES, OrderError } from "@/server/orders";
import { createReservation, reservationSchema } from "@/server/reservations";

export type FormState = { error?: string; ok?: string } | null;

export async function addReservation(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(ORDER_ROLES);
  const parsed = reservationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const r = await createReservation(s.restaurantId, { ...parsed.data, tableId: String(formData.get("tableId") || "") || null }, "STAFF");
    after(() => notifyBooking(r.id));
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/reservations");
  return { ok: "Booking saved" };
}

const updateSchema = z.object({
  id: z.string(),
  status: z.enum(["CONFIRMED", "SEATED", "CANCELLED", "NO_SHOW"]).optional(),
  tableId: z.string().nullable().optional(),
});

export async function updateReservation(input: z.input<typeof updateSchema>): Promise<FormState> {
  const s = await requireRestaurantSession(ORDER_ROLES);
  const d = updateSchema.parse(input);
  if (d.tableId && !(await db.diningTable.findFirst({ where: { id: d.tableId, restaurantId: s.restaurantId } }))) return { error: "Table not found" };
  await db.$transaction(async (tx) => {
    await tx.reservation.updateMany({
      where: { id: d.id, restaurantId: s.restaurantId },
      data: { ...(d.status ? { status: d.status } : {}), ...(d.tableId !== undefined ? { tableId: d.tableId } : {}) },
    });
    await bumpLive(tx, s.restaurantId);
  });
  if (d.status === "CONFIRMED") after(() => notifyBooking(d.id));
  revalidatePath("/dashboard/reservations");
  return { ok: "Updated" };
}
