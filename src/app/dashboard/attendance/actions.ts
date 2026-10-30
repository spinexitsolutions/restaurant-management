"use server";

import { revalidatePath } from "next/cache";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";

export async function clockIn() {
  const s = await requireRestaurantSession();
  const open = await db.attendance.findFirst({ where: { userId: s.userId, clockOut: null } });
  if (!open) {
    await db.attendance.create({ data: { restaurantId: s.restaurantId, userId: s.userId, businessDate: istDate(), clockIn: new Date() } });
  }
  revalidatePath("/dashboard", "layout");
}

export async function clockOut() {
  const s = await requireRestaurantSession();
  await db.attendance.updateMany({ where: { userId: s.userId, clockOut: null }, data: { clockOut: new Date() } });
  revalidatePath("/dashboard", "layout");
}

/** Manager closes a shift someone forgot to clock out of. */
export async function closeShift(id: string) {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  await db.attendance.updateMany({ where: { id, restaurantId: s.restaurantId, clockOut: null }, data: { clockOut: new Date(), note: `Clocked out by ${s.name}` } });
  revalidatePath("/dashboard/attendance");
}
