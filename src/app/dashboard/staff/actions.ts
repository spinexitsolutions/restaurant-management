"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | null;

const STAFF_ROLES = ["MANAGER", "CASHIER", "WAITER", "CHEF"] as const;

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email (used to log in)"),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")]),
  role: z.enum(STAFF_ROLES),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function createStaff(_: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (session.role === "MANAGER" && d.role === "MANAGER") return { error: "Only the owner can add managers" };
  if (await db.user.findUnique({ where: { email: d.email }, select: { id: true } })) {
    return { error: "This email is already in use" };
  }
  await db.user.create({
    data: {
      restaurantId: session.restaurantId,
      name: d.name,
      email: d.email,
      phone: d.phone || null,
      role: d.role,
      passwordHash: await bcrypt.hash(d.password, 10),
    },
  });
  revalidatePath("/dashboard/staff");
  return { ok: `${d.name} added. They can log in with ${d.email}` };
}

/** Loads a staff member the current user is allowed to manage. */
async function manageable(id: string) {
  const session = await requireRestaurantSession(MANAGE_ROLES);
  const user = await db.user.findFirst({ where: { id, restaurantId: session.restaurantId } });
  if (!user) return { error: "Staff member not found" } as const;
  if (user.id === session.userId) return { error: "You can't change your own account here" } as const;
  if (user.role === "OWNER") return { error: "The owner account can't be changed" } as const;
  if (session.role === "MANAGER" && user.role === "MANAGER") return { error: "Only the owner can change managers" } as const;
  return { user, session } as const;
}

export async function setStaffRole(id: string, role: string): Promise<FormState> {
  const res = await manageable(id);
  if ("error" in res) return { error: res.error };
  const parsed = z.enum(STAFF_ROLES).safeParse(role);
  if (!parsed.success) return { error: "Invalid role" };
  if (res.session.role === "MANAGER" && parsed.data === "MANAGER") return { error: "Only the owner can make managers" };
  await db.user.update({ where: { id }, data: { role: parsed.data } });
  revalidatePath("/dashboard/staff");
  return { ok: "Role updated" };
}

export async function toggleStaffActive(id: string): Promise<FormState> {
  const res = await manageable(id);
  if ("error" in res) return { error: res.error };
  await db.user.update({ where: { id }, data: { isActive: !res.user.isActive } });
  revalidatePath("/dashboard/staff");
  return { ok: res.user.isActive ? "Deactivated" : "Activated" };
}

export async function resetStaffPassword(id: string, password: string): Promise<FormState> {
  const res = await manageable(id);
  if ("error" in res) return { error: res.error };
  if (password.length < 6) return { error: "Password must be at least 6 characters" };
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return { ok: "Password changed" };
}

/** Owners and managers set their own approval PIN, used to approve discounts and cancellations. */
export async function setMyPin(_: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRestaurantSession(MANAGE_ROLES);
  const pin = String(formData.get("pin") ?? "");
  if (!/^\d{4,6}$/.test(pin)) return { error: "PIN must be 4 to 6 digits" };
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return { error: "Choose a PIN that is harder to guess" };
  }
  await db.user.update({ where: { id: session.userId }, data: { pinHash: await bcrypt.hash(pin, 10) } });
  return { ok: "Approval PIN saved" };
}
