"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, getSession, getValidUser, signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PlanDef } from "@/lib/plans";
import { SUPPORT_MAX_AGE_SECONDS } from "@/lib/session";
import { ownerOf, requireSuperAdmin } from "@/server/admin";
import { uniqueResellerCode } from "@/server/resellers";
import { applySubscription } from "@/server/subscriptions";

export type FormState = { error?: string; ok?: string } | null;

// Unambiguous characters only, so it can be read out over the phone.
function tempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
}

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  if (id) revalidatePath(`/admin/restaurants/${id}`);
}

/** Gives an owner a temporary password (shown once) and signs them out everywhere. */
export async function resetOwnerPassword(restaurantId: string): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
  const admin = await getValidUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return { ok: false, error: "Not allowed" };
  const owner = await ownerOf(restaurantId);
  if (!owner) return { ok: false, error: "No owner found" };
  const password = tempPassword();
  await db.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } } });
  return { ok: true, email: owner.email, password };
}

export async function toggleRestaurant(id: string) {
  await requireSuperAdmin();
  const r = await db.restaurant.findUnique({ where: { id }, select: { isActive: true } });
  if (r) await db.restaurant.update({ where: { id }, data: { isActive: !r.isActive } });
  refresh(id);
}

/** Free extra days (trial extension or goodwill), without a payment. */
export async function extendTrial(id: string, days: number) {
  await requireSuperAdmin();
  if (!Number.isInteger(days) || days < 1 || days > 90) return;
  const r = await db.restaurant.findUnique({ where: { id }, select: { planExpiresAt: true } });
  if (!r) return;
  const from = r.planExpiresAt && r.planExpiresAt > new Date() ? r.planExpiresAt : new Date();
  await db.restaurant.update({ where: { id }, data: { planExpiresAt: new Date(from.getTime() + days * 86_400_000) } });
  refresh(id);
}

/** Records an offline payment (cash / bank transfer / UPI) and extends the outlet's plan. */
export async function extendPlan(_: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const months = Number(formData.get("months"));
  const amount = Math.round(Number(formData.get("amount") || 0) * 100);
  if (!Number.isInteger(months) || months < 1 || months > 36 || !(amount >= 0)) return { error: "Check months and amount" };
  const plan = { code: months >= 12 ? "YEARLY" : months >= 3 ? "QUARTERLY" : "MONTHLY", name: "Manual", months, pricePaise: amount } as PlanDef;
  const p = await applySubscription(id, plan, { method: "MANUAL", amountPaise: amount, months, note: String(formData.get("note") || "") || undefined });
  refresh(id);
  return { ok: `Extended till ${p.periodEnd.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} (invoice ${p.invoiceNumber})` };
}

export async function saveAdminNote(id: string, note: string) {
  await requireSuperAdmin();
  await db.restaurant.update({ where: { id }, data: { adminNote: note.trim().slice(0, 2000) || null } });
  refresh(id);
}

export async function assignReseller(restaurantId: string, resellerId: string) {
  await requireSuperAdmin();
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { organizationId: true } });
  await db.organization.update({ where: { id: r.organizationId }, data: { resellerId: resellerId || null } });
  refresh(restaurantId);
}

/**
 * Support: the admin opens the restaurant's dashboard as its owner for 2 hours. The owner's
 * activity log records it, and every action taken shows "(support: …)".
 */
export async function supportLogin(restaurantId: string) {
  const admin = await requireSuperAdmin();
  const owner = await ownerOf(restaurantId);
  if (!owner) return { ok: false as const, error: "This restaurant has no active owner" };
  // Open the outlet that was clicked (owners can switch between their outlets).
  if (owner.restaurantId !== restaurantId) await db.user.update({ where: { id: owner.id }, data: { restaurantId } });
  await db.auditLog.create({ data: { restaurantId, userId: admin.id, userName: `${admin.name} (platform support)`, action: "SUPPORT_LOGIN" } });
  await createSession(
    { userId: owner.id, restaurantId, role: owner.role, name: owner.name, v: owner.sessionVersion, imp: admin.id, impName: admin.name },
    SUPPORT_MAX_AGE_SECONDS,
  );
  redirect("/dashboard");
}

/** Leaves support mode and returns to the admin panel. */
export async function exitSupport() {
  const session = await getSession();
  if (!session?.imp) redirect("/dashboard");
  const admin = await db.user.findUnique({ where: { id: session.imp } });
  if (!admin || admin.role !== "SUPER_ADMIN" || !admin.isActive) redirect("/login");
  if (session.restaurantId) await db.auditLog.create({ data: { restaurantId: session.restaurantId, userId: admin.id, userName: `${admin.name} (platform support)`, action: "SUPPORT_LOGOUT" } });
  await signIn(admin);
  redirect(session.restaurantId ? `/admin/restaurants/${session.restaurantId}` : "/admin");
}

const resellerSchema = z.object({
  name: z.string().trim().min(2, "Enter the partner's name").max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  email: z.string().trim().toLowerCase().email("Enter a valid email (used to log in)"),
  commissionRate: z.coerce.number().min(0).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s || null)
    .refine((s) => s === null || /^[A-Z0-9]{3,20}$/.test(s), "Code: 3-20 letters/numbers"),
});

/** Adds a sales partner with a portal login; the temporary password is shown once. */
export async function createReseller(_: FormState, formData: FormData): Promise<FormState & { password?: string }> {
  await requireSuperAdmin();
  const parsed = resellerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return { error: "An account with this email already exists" };
  const code = d.code ?? (await uniqueResellerCode(d.name));
  if (await db.reseller.findUnique({ where: { code } })) return { error: `Code ${code} is taken` };
  const password = tempPassword();
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: d.name, email: d.email, phone: d.phone, role: "RESELLER", passwordHash: await bcrypt.hash(password, 10) } });
    await tx.reseller.create({ data: { name: d.name, phone: d.phone, email: d.email, code, commissionRate: d.commissionRate, userId: user.id } });
  });
  refresh();
  return { ok: `${d.name} added with code ${code}. Login: ${d.email} / ${password}`, password };
}

export async function setResellerActive(id: string, isActive: boolean) {
  await requireSuperAdmin();
  const r = await db.reseller.update({ where: { id }, data: { isActive } });
  if (r.userId) await db.user.update({ where: { id: r.userId }, data: { isActive } });
  refresh();
}

export async function setResellerRate(id: string, rate: number) {
  await requireSuperAdmin();
  if (!(rate >= 0 && rate <= 100)) return;
  await db.reseller.update({ where: { id }, data: { commissionRate: rate } });
  refresh();
}

/** Money sent to a partner against their earned commission. */
export async function recordPayout(_: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const id = String(formData.get("resellerId"));
  const amount = Number(formData.get("amount"));
  if (!(amount > 0 && amount < 10_000_000)) return { error: "Enter the amount paid" };
  await db.resellerPayout.create({
    data: { resellerId: id, amount, reference: String(formData.get("reference") || "").slice(0, 80) || null, note: String(formData.get("note") || "").slice(0, 200) || null },
  });
  refresh();
  return { ok: `Payout of ₹${amount} recorded` };
}
