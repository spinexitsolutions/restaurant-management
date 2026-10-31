"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRestaurantSession } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { UPI_ID_PATTERN, verifyRazorpayKeys } from "@/lib/payments";
import { gstinError } from "@/lib/gstin";

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

const gstSchema = z.object({
  gstEnabled: checkbox,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s || null)
    .superRefine((s, ctx) => {
      const err = s && gstinError(s);
      if (err) ctx.addIssue({ code: "custom", message: err });
    }),
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

const loyaltySchema = z.object({
  loyaltyEnabled: checkbox,
  loyaltyEarnPer100: z.coerce.number().min(0).max(100, "Earn rate can be at most 100 points per ₹100"),
  loyaltyPointValue: z.coerce.number().min(0.01, "A point must be worth at least ₹0.01").max(100),
  loyaltyMinRedeem: z.coerce.number().int().min(1).max(100000),
  birthdayOfferText: z.string().trim().min(5, "Write an offer message").max(500),
  reservationsEnabled: checkbox,
  winbackEnabled: checkbox,
  winbackDays: z.coerce.number().int().min(7, "At least 7 days").max(365),
  winbackOffer: z.string().trim().min(3, "Write the offer, e.g. 15% off your next visit").max(120),
});

export async function saveLoyalty(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = loyaltySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("Customer settings saved");
}

const aggregatorSchema = z.object({
  zomatoCommission: z.coerce.number().min(0).max(60, "Commission looks too high"),
  swiggyCommission: z.coerce.number().min(0).max(60, "Commission looks too high"),
});

export async function saveAggregators(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = aggregatorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.restaurant.update({ where: { id: restaurantId }, data: parsed.data });
  return done("Aggregator settings saved");
}

const templateName = z
  .string()
  .trim()
  .max(100)
  .refine((s) => !s || /^[a-z0-9_]+$/.test(s), "Template names use lowercase letters, numbers and _ only")
  .transform((s) => s || null);

const waSchema = z.object({
  waPhoneNumberId: z.string().trim().regex(/^\d*$/, "Phone number ID is a number from Meta").max(30).transform((s) => s || null),
  waAccessToken: z.string().trim().max(1000),
  waTemplateLang: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Language code like en, hi or en_US"),
  waBillTemplate: templateName,
  waBookingTemplate: templateName,
  waBirthdayTemplate: templateName,
  waSummaryTemplate: templateName,
  waWinbackTemplate: templateName,
});

export async function saveWhatsApp(_: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const parsed = waSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { waAccessToken, ...rest } = parsed.data;
  await db.restaurant.update({
    where: { id: restaurantId },
    data: { ...rest, ...(waAccessToken ? { waAccessTokenEnc: encrypt(waAccessToken) } : {}), ...(!rest.waPhoneNumberId ? { waAccessTokenEnc: null } : {}) },
  });
  return done(rest.waPhoneNumberId ? "WhatsApp settings saved" : "WhatsApp disconnected");
}

/** Sends Meta's built-in "hello_world" template to the restaurant's own number to check the setup. */
export async function sendTestWhatsApp(): Promise<FormState> {
  const { restaurantId } = await requireRestaurantSession(["OWNER"]);
  const { sendTemplate } = await import("@/server/whatsapp");
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const to = r.whatsappNumber || r.phone;
  if (!to) return { error: "Add your WhatsApp number in Customer QR menu settings first" };
  const res = await sendTemplate(r, "TEST", to, "hello_world", [], "en_US");
  revalidatePath("/dashboard/settings");
  return res.ok ? { ok: `Test message sent to ${to}` } : { error: `Meta said: ${res.error}` };
}
