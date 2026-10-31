"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";
import { destroySession, signIn } from "@/lib/auth";
import { clientIp, lockMessage, recordAttempt } from "@/server/auth-guard";
import { consumeOtp, findAccount, issueOtp, OtpError, otpAvailable } from "@/server/otp";
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
  ref: z.string().trim().toUpperCase().max(20).optional(),
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
    ref: String(formData.get("ref") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return { error: "An account with this email already exists. Please log in." };
  }

  const slug = await uniqueSlug(data.restaurantName);
  // Referral from a sales partner (/signup?ref=CODE); an unknown code is simply ignored.
  const reseller = data.ref ? await db.reseller.findFirst({ where: { code: data.ref, isActive: true }, select: { id: true } }) : null;
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await db.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name: data.restaurantName,
        organization: { create: { name: data.restaurantName, resellerId: reseller?.id ?? null } },
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

  await signIn(user);
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

const HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  CHEF: "/dashboard/kitchen",
  WAITER: "/dashboard/waiter",
  CASHIER: "/dashboard/pos",
  RESELLER: "/partner",
};

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DHsqKbqTnQjnqF1F6R4N4zGq3m2Gm";

/** Checks the account can sign in, records the success and starts the session. */
async function finishSignIn(user: { id: string; isActive: boolean; restaurantId: string | null; role: Role; name: string; sessionVersion: number }, key: string, ip: string) {
  if (!user.isActive) return { error: "Your account has been deactivated. Contact your manager." };
  if (user.restaurantId) {
    const r = await db.restaurant.findUnique({ where: { id: user.restaurantId }, select: { isActive: true } });
    if (!r?.isActive) return { error: "This restaurant account is suspended." };
  }
  await recordAttempt(key, ip, true);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await signIn(user);
  redirect(HOME[user.role] ?? "/dashboard");
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const key = `email:${parsed.data.email}`;
  const ip = await clientIp();
  const locked = await lockMessage(key, ip);
  if (locked) return { error: locked };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    await recordAttempt(key, ip, false);
    return { error: "Incorrect email or password" };
  }
  return finishSignIn(user, key, ip);
}

export type OtpState = { error?: string; ok?: string; step?: "code"; identifier?: string } | null;

const SENT = "If an account matches, we've sent a 6-digit code. It is valid for 10 minutes.";

/** Step 1 of OTP sign-in and password reset: send a code. Never reveals whether the account exists. */
export async function requestCode(prev: OtpState, formData: FormData): Promise<OtpState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const purpose = formData.get("purpose") === "LOGIN" ? "LOGIN" : "RESET";
  if (!identifier) return { error: "Enter your email or mobile number" };
  if (!otpAvailable()) return { error: "Codes can't be sent yet. Ask your owner or manager to reset your password." };
  const ip = await clientIp();
  const locked = await lockMessage(`otp:${identifier.toLowerCase()}`, ip);
  if (locked) return { error: locked };

  const user = await findAccount(identifier);
  if (user) {
    try {
      await issueOtp(user, purpose, identifier.includes("@"));
    } catch (e) {
      if (e instanceof OtpError) return { error: e.message };
      throw e;
    }
  } else {
    await recordAttempt(`otp:${identifier.toLowerCase()}`, ip, false);
  }
  return { ok: SENT, step: "code", identifier };
}

/** Step 2 of OTP sign-in. */
export async function loginWithCode(prev: OtpState, formData: FormData): Promise<OtpState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const code = String(formData.get("code") ?? "");
  const key = `otp:${identifier.toLowerCase()}`;
  const ip = await clientIp();
  const locked = await lockMessage(key, ip);
  if (locked) return { error: locked, step: "code", identifier };
  const user = await findAccount(identifier);
  if (!user || !(await consumeOtp(user, "LOGIN", code))) {
    await recordAttempt(key, ip, false);
    return { error: "Wrong or expired code", step: "code", identifier };
  }
  return (await finishSignIn(user, key, ip)) as OtpState;
}

const newPassword = z.string().min(8, "Password must be at least 8 characters").max(200);

/** Step 2 of password reset: check the code, set the new password and sign out every other device. */
export async function resetPassword(prev: OtpState, formData: FormData): Promise<OtpState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const code = String(formData.get("code") ?? "");
  const pw = newPassword.safeParse(formData.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message, step: "code", identifier };
  const key = `otp:${identifier.toLowerCase()}`;
  const ip = await clientIp();
  const locked = await lockMessage(key, ip);
  if (locked) return { error: locked, step: "code", identifier };
  const user = await findAccount(identifier);
  if (!user || !(await consumeOtp(user, "RESET", code))) {
    await recordAttempt(key, ip, false);
    return { error: "Wrong or expired code", step: "code", identifier };
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(pw.data, 10), sessionVersion: { increment: 1 } },
  });
  // A successful reset also clears password lockouts on the account.
  await recordAttempt(`email:${updated.email}`, ip, true);
  return (await finishSignIn(updated, key, ip)) as OtpState;
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
