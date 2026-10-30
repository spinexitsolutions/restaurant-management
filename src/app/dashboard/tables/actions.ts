"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | null;

const bulkSchema = z.object({
  prefix: z.string().trim().max(20),
  from: z.coerce.number().int().min(0).max(999),
  to: z.coerce.number().int().min(0).max(999),
  area: z.string().trim().max(40),
  capacity: z.coerce.number().int().min(1).max(50),
});

export async function addTables(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = bulkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { prefix, from, to, area, capacity } = parsed.data;
  if (to < from) return { error: "'To' must be greater than or equal to 'From'" };
  if (to - from >= 100) return { error: "You can add up to 100 tables at a time" };

  const existing = new Set(
    (await db.diningTable.findMany({ where: { restaurantId }, select: { name: true } })).map((t) => t.name.toLowerCase()),
  );
  const last = await db.diningTable.findFirst({ where: { restaurantId }, orderBy: { sortOrder: "desc" } });
  let sortOrder = (last?.sortOrder ?? -1) + 1;

  const names = Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`).filter((n) => !existing.has(n.toLowerCase()));
  if (names.length === 0) return { error: "All of these tables already exist" };

  await db.diningTable.createMany({
    data: names.map((name) => ({ restaurantId, name, area: area || null, capacity, sortOrder: sortOrder++ })),
  });
  revalidatePath("/dashboard/tables");
  const skipped = to - from + 1 - names.length;
  return { ok: `Added ${names.length} table(s)${skipped ? `, skipped ${skipped} that already existed` : ""}` };
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Table name is required").max(20),
  area: z.string().trim().max(40),
  capacity: z.coerce.number().int().min(1).max(50),
});

export async function updateTable(input: z.input<typeof updateSchema>): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name, area, capacity } = parsed.data;
  const clash = await db.diningTable.findFirst({ where: { restaurantId, name: { equals: name, mode: "insensitive" }, NOT: { id } } });
  if (clash) return { error: `A table named ${name} already exists` };
  await db.diningTable.updateMany({ where: { id, restaurantId }, data: { name, area: area || null, capacity } });
  revalidatePath("/dashboard/tables");
  return { ok: "Saved" };
}

export async function deleteTable(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  await db.diningTable.deleteMany({ where: { id, restaurantId } });
  revalidatePath("/dashboard/tables");
}

/** Issues a new QR token so previously printed QR codes for this table stop working. */
export async function regenerateQr(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  await db.diningTable.updateMany({ where: { id, restaurantId }, data: { qrToken: randomBytes(12).toString("base64url") } });
  revalidatePath("/dashboard/tables");
}
