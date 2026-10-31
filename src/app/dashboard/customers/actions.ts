"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { isValidMonthDay } from "@/lib/crm";
import { db } from "@/lib/db";
import { audit } from "@/server/approval";
import { BILLING_ROLES } from "@/server/orders";

export type FormState = { error?: string; ok?: string } | null;

const monthDay = z
  .string()
  .trim()
  .transform((s) => s || null)
  .refine((s) => s === null || isValidMonthDay(s), "Pick a valid date");

const customerSchema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  name: z.string().trim().max(60).transform((s) => s || null),
  birthday: monthDay,
  anniversary: monthDay,
  notes: z.string().trim().max(500).optional().transform((s) => s || null),
});

/** `<input type="date">` gives yyyy-mm-dd; we only keep the month and day. */
function toMonthDay(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s;
}

function read(formData: FormData) {
  return customerSchema.safeParse({
    phone: formData.get("phone"),
    name: formData.get("name") ?? "",
    birthday: toMonthDay(formData.get("birthday")),
    anniversary: toMonthDay(formData.get("anniversary")),
    notes: formData.get("notes") ?? "",
  });
}

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(BILLING_ROLES);
  const parsed = read(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const exists = await db.customer.findUnique({ where: { restaurantId_phone: { restaurantId: s.restaurantId, phone: d.phone } } });
  if (exists) return { error: "A customer with this number already exists" };
  await db.customer.create({ data: { restaurantId: s.restaurantId, ...d } });
  revalidatePath("/dashboard/customers");
  return { ok: "Customer added" };
}

export async function updateCustomer(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(BILLING_ROLES);
  const id = String(formData.get("id"));
  const parsed = read(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const clash = await db.customer.findFirst({ where: { restaurantId: s.restaurantId, phone: parsed.data.phone, NOT: { id } } });
  if (clash) return { error: "Another customer has this number" };
  const res = await db.customer.updateMany({ where: { id, restaurantId: s.restaurantId }, data: parsed.data });
  if (!res.count) return { error: "Customer not found" };
  revalidatePath(`/dashboard/customers/${id}`);
  return { ok: "Saved" };
}

export async function adjustPoints(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const id = String(formData.get("id"));
  const points = Number(formData.get("points"));
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1_000_000) return { error: "Enter points to add (or a negative number to remove)" };
  if (note.length < 3) return { error: "Enter a reason" };
  const done = await db.$transaction(async (tx) => {
    const res = await tx.customer.updateMany({
      where: { id, restaurantId: s.restaurantId, ...(points < 0 ? { points: { gte: -points } } : {}) },
      data: { points: { increment: points } },
    });
    if (!res.count) return false;
    await tx.loyaltyTransaction.create({ data: { customerId: id, type: "ADJUST", points, note } });
    return true;
  });
  if (!done) return { error: "Not enough points to remove" };
  await audit({ restaurantId: s.restaurantId, actor: s, action: "POINTS_ADJUSTED", details: { customerId: id, points, note } });
  revalidatePath(`/dashboard/customers/${id}`);
  return { ok: "Points updated" };
}

/** Records that a "we miss you" message was sent by hand from the Customers page. */
export async function markWinbackSent(customerId: string) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  await db.customer.updateMany({ where: { id: customerId, restaurantId: s.restaurantId }, data: { lastWinbackAt: new Date() } });
  revalidatePath("/dashboard/customers");
}

export async function setMarketingOptOut(customerId: string, optOut: boolean) {
  const s = await requireRestaurantSession(BILLING_ROLES);
  await db.customer.updateMany({ where: { id: customerId, restaurantId: s.restaurantId }, data: { marketingOptOut: optOut } });
  revalidatePath(`/dashboard/customers/${customerId}`);
}
