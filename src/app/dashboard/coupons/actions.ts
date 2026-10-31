"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { CODE_PATTERN, describeCoupon, normaliseCode } from "@/lib/coupons";
import { db } from "@/lib/db";
import { audit } from "@/server/approval";
import { toRule } from "@/server/coupons";

export type FormState = { error?: string; ok?: string } | null;

const optionalInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(1_000_000).nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.date().nullable());

const couponSchema = z
  .object({
    code: z
      .string()
      .transform(normaliseCode)
      .refine((c) => CODE_PATTERN.test(c), "Code: 3–20 letters/numbers, e.g. FIRST50"),
    description: z.string().trim().max(120).transform((s) => s || null),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.coerce.number().positive("Enter the discount"),
    maxDiscount: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().positive().max(1_000_000).nullable()),
    minBill: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(1_000_000)),
    validFrom: optionalDate,
    validTo: optionalDate,
    usageLimit: optionalInt,
    perCustomerLimit: optionalInt,
    firstOrderOnly: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .refine((c) => c.type === "FLAT" || c.value <= 100, { message: "Percent must be 100 or less" })
  .refine((c) => !c.validFrom || !c.validTo || c.validFrom <= c.validTo, { message: "End date is before the start date" })
  .transform((c) => ({
    ...c,
    maxDiscount: c.type === "PERCENT" ? c.maxDiscount : null,
    // Dates come from <input type="date">; make the last day count fully (IST).
    validTo: c.validTo ? new Date(c.validTo.getTime() + 86_400_000 - 1 - 5.5 * 3_600_000) : null,
    validFrom: c.validFrom ? new Date(c.validFrom.getTime() - 5.5 * 3_600_000) : null,
  }));

export async function createCoupon(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = couponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const exists = await db.coupon.findUnique({ where: { restaurantId_code: { restaurantId: s.restaurantId, code: d.code } } });
  if (exists) return { error: `${d.code} already exists` };
  await db.coupon.create({ data: { restaurantId: s.restaurantId, ...d } });
  await audit({ restaurantId: s.restaurantId, actor: s, action: "COUPON_CREATED", details: { code: d.code } });
  revalidatePath("/dashboard/coupons");
  return { ok: `${d.code} created` };
}

export async function toggleCoupon(id: string, isActive: boolean) {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  await db.coupon.updateMany({ where: { id, restaurantId: s.restaurantId }, data: { isActive } });
  revalidatePath("/dashboard/coupons");
}

/** Puts the coupon into the automatic "we miss you" WhatsApp message so lapsed guests get a real code. */
export async function setWinbackCoupon(id: string) {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const c = await db.coupon.findFirst({ where: { id, restaurantId: s.restaurantId } });
  if (!c) return { ok: false as const, error: "Coupon not found" };
  const offer = `${describeCoupon(toRule(c))} with code ${c.code}`.slice(0, 120);
  await db.restaurant.update({ where: { id: s.restaurantId }, data: { winbackOffer: offer } });
  revalidatePath("/dashboard", "layout");
  return { ok: true as const, offer };
}
