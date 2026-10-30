"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { UPI_ID_PATTERN, verifyRazorpayKeys } from "@/lib/payments";

export type FormState = { error?: string; ok?: string } | null;

const optional = (max: number) => z.string().trim().max(max).transform((s) => s || null);
const checkbox = z.preprocess((v) => v === "on", z.boolean());

function done(ok: string): FormState {
  revalidatePath("/dashboard", "layout");
  return { ok };
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Restaurant name is too short").max(80),
  phone: optional(15),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).transform((s) => s || null),
  address: optional(200),
  city: optional(60),
  state: optional(60),
  pincode: z.union([z.literal(""), z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits")]).transform((s) => s || null),
  fssaiNumber: z.union([z.literal(""), z.string().trim().regex(/^\d{14}$/, "FSSAI licence number must be 14 digits")]).transform((s) => s || null),
  logoUrl: z.union([z.literal(""), z.string().trim().regex(/^\/api\/images\/[a-z0-9]+$/), z.string().trim().url("Logo must be a valid URL")]).transform((s) => s || null),
});

export async function saveProfile(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER", "MANAGER"]);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("Restaurant details saved");
}

// 15-character GSTIN: 2-digit state code, PAN, entity number, Z, checksum.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const gstSchema = z.object({
  gstEnabled: checkbox,
  gstin: z.string().trim().toUpperCase().transform((s) => s || null).refine((s) => !s || GSTIN_PATTERN.test(s), "GSTIN looks invalid (15 characters, e.g. 27ABCDE1234F1Z5)"),
  gstMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]),
  defaultGstRate: z.coerce.number().min(0).max(28),
  serviceChargeEnabled: checkbox,
  serviceChargeRate: z.coerce.number().min(0, "Service charge can't be negative").max(20, "Service charge can be at most 20%"),
  requireManagerPin: checkbox,
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, "Invoice prefix: up to 5 letters or numbers (GST invoice numbers are limited to 16 characters)"),
});

export async function saveGst(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = gstSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.gstEnabled && !parsed.data.gstin) return { error: "Enter your GSTIN, or turn GST off if you are not registered" };
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("GST & billing settings saved");
}

const upiSchema = z.object({
  upiId: z.string().trim().transform((s) => s || null).refine((s) => !s || UPI_ID_PATTERN.test(s), "UPI ID looks invalid (e.g. yourname@okhdfcbank)"),
  upiPayeeName: optional(60),
  acceptCash: checkbox,
  acceptCard: checkbox,
});

export async function savePaymentBasics(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = upiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("Payment settings saved");
}

const razorpaySchema = z.object({
  keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "Key ID should start with rzp_test_ or rzp_live_"),
  keySecret: z.string().trim(),
  webhookSecret: z.string().trim().max(200),
});

export async function saveRazorpay(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = razorpaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { keyId, keySecret, webhookSecret } = parsed.data;

  const current = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { razorpayKeySecretEnc: true } });
  // The secret is never sent back to the browser, so an empty field means "keep the saved one".
  if (!keySecret && !current.razorpayKeySecretEnc) return { error: "Enter the Razorpay Key Secret" };

  let warning = "";
  if (keySecret) {
    try {
      if (!(await verifyRazorpayKeys(keyId, keySecret))) return { error: "Razorpay rejected these keys. Check the Key ID and Secret." };
    } catch {
      warning = " (couldn't reach Razorpay to verify them right now)";
    }
  }

  await db.restaurant.update({
    where: { id: restaurantId },
    data: {
      razorpayKeyId: keyId,
      ...(keySecret ? { razorpayKeySecretEnc: encrypt(keySecret) } : {}),
      ...(webhookSecret ? { razorpayWebhookSecretEnc: encrypt(webhookSecret) } : {}),
    },
  });
  return done(`Razorpay connected${warning}. Customers will now pay through Razorpay.`);
}

export async function removeRazorpay(): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  await db.restaurant.update({
    where: { id: restaurantId },
    data: { razorpayKeyId: null, razorpayKeySecretEnc: null, razorpayWebhookSecretEnc: null },
  });
  return done("Razorpay removed. Payments fall back to your UPI QR.");
}

const menuSchema = z.object({
  qrOrderingEnabled: checkbox,
  autoAcceptQrOrders: checkbox,
  whatsappOrderingEnabled: checkbox,
  whatsappNumber: z.union([z.literal(""), z.string().trim().regex(/^[6-9]\d{9}$/, "WhatsApp number must be a 10-digit mobile number")]).transform((s) => s || null),
  menuThemeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour"),
});

export async function saveMenuSettings(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER", "MANAGER"]);
  const parsed = menuSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.whatsappOrderingEnabled && !parsed.data.whatsappNumber) {
    return { error: "Add a WhatsApp number to receive orders on WhatsApp" };
  }
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("Customer menu settings saved");
}
