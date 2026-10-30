"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { createSampleMenu } from "@/lib/sample-menu";
import { slugify } from "@/lib/utils";

export type FormState = { error?: string; ok?: string } | null;

const signupSchema = z.object({
  restaurantName: z.string().trim().min(2, "Restaurant name is too short").max(80),
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  sampleMenu: z.boolean(),
});

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "restaurant";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await db.restaurant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new Error("Could not generate a unique restaurant URL");
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    sampleMenu: formData.get("sampleMenu") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return { error: "An account with this email already exists. Please log in." };
  }

  const slug = await uniqueSlug(data.restaurantName);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await db.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name: data.restaurantName,
        organization: { create: { name: data.restaurantName } },
        slug,
        phone: data.phone,
        whatsappNumber: data.phone,
        email: data.email,
        planExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        tables: { create: Array.from({ length: 6 }, (_, i) => ({ name: `T${i + 1}`, sortOrder: i })) },
      },
    });
    if (data.sampleMenu) await createSampleMenu(tx, restaurant.id);
    return tx.user.create({
      data: {
        restaurantId: restaurant.id,
        name: data.ownerName,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: "OWNER",
      },
    });
  });

  await createSession({ userId: user.id, restaurantId: user.restaurantId, role: user.role, name: user.name });
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { restaurant: { select: { isActive: true } } },
  });
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid) return { error: "Incorrect email or password" };
  if (!user.isActive) return { error: "Your account has been deactivated. Contact your manager." };
  if (user.restaurant && !user.restaurant.isActive) return { error: "This restaurant account is suspended." };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ userId: user.id, restaurantId: user.restaurantId, role: user.role, name: user.name });
  const home: Record<string, string> = {
    SUPER_ADMIN: "/admin",
    CHEF: "/dashboard/kitchen",
    WAITER: "/dashboard/waiter",
    CASHIER: "/dashboard/pos",
  };
  redirect(home[user.role] ?? "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
