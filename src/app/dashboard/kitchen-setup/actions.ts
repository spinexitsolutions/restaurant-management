"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { enqueueTestPrint } from "@/server/printing";

export type FormState = { error?: string; ok?: string } | null;

const done = (ok: string): FormState => {
  revalidatePath("/dashboard", "layout");
  return { ok };
};

export async function addStation(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const name = z.string().trim().min(2, "Enter a station name").max(40).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  if (await db.kitchenStation.findFirst({ where: { restaurantId, name: { equals: name.data, mode: "insensitive" } } })) return { error: "That station already exists" };
  const count = await db.kitchenStation.count({ where: { restaurantId } });
  await db.kitchenStation.create({ data: { restaurantId, name: name.data, sortOrder: count } });
  return done(`${name.data} added`);
}

export async function deleteStation(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  // Categories, dishes and printers fall back to the main kitchen (onDelete: SetNull).
  await db.kitchenStation.deleteMany({ where: { id, restaurantId } });
  done("Deleted");
}

export async function setCategoryStation(categoryId: string, stationId: string | null) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  if (stationId && !(await db.kitchenStation.findFirst({ where: { id: stationId, restaurantId } }))) return;
  await db.category.updateMany({ where: { id: categoryId, restaurantId }, data: { stationId } });
  done("Saved");
}

const printerSchema = z.object({
  name: z.string().trim().min(2, "Enter a printer name").max(40),
  connection: z.enum(["BROWSER", "AGENT"]),
  // Only network printers have an address field on the form.
  address: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((s) => s || null),
  paperWidth: z.coerce.number().refine((w) => w === 58 || w === 80, "Paper width is 58 or 80 mm"),
  printKot: z.boolean(),
  printBill: z.boolean(),
  stationId: z
    .string()
    .transform((s) => s || null)
    .nullable(),
});

export async function addPrinter(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = printerSchema.safeParse({
    ...Object.fromEntries(formData),
    printKot: formData.get("printKot") === "on",
    printBill: formData.get("printBill") === "on",
    stationId: String(formData.get("stationId") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!d.printKot && !d.printBill) return { error: "Choose what this printer prints: KOTs, bills or both" };
  if (d.connection === "AGENT" && d.address && !/^[\w.-]+(:\d{2,5})?$|^[\w./\\:-]+$/.test(d.address)) return { error: "Address should look like 192.168.1.50:9100" };
  if (d.stationId && !(await db.kitchenStation.findFirst({ where: { id: d.stationId, restaurantId } }))) return { error: "Station not found" };
  await db.printer.create({ data: { restaurantId, ...d } });
  return done(`${d.name} added`);
}

export async function deletePrinter(id: string) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  await db.printer.deleteMany({ where: { id, restaurantId } });
  done("Deleted");
}

export async function testPrinter(id: string): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const ok = await enqueueTestPrint(restaurantId, id);
  return ok ? { ok: "Test page sent to the queue" } : { error: "Printer not found" };
}

export async function setCategoryCourse(categoryId: string, course: number) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  if (![0, 1, 2, 3].includes(course)) return;
  await db.category.updateMany({ where: { id: categoryId, restaurantId }, data: { course } });
  done("Saved");
}

export async function setCourseFiring(on: boolean) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  await db.restaurant.update({ where: { id: restaurantId }, data: { courseFiring: on } });
  done("Saved");
}
