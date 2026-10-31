"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Gives an owner a temporary password (shown once) and signs them out everywhere. */
export async function resetOwnerPassword(restaurantId: string): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
  const admin = await getValidUser();
  if (!admin || admin.role !== "SUPER_ADMIN") return { ok: false, error: "Not allowed" };
  const owner = await db.user.findFirst({ where: { restaurantId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
  if (!owner) return { ok: false, error: "No owner found" };
  // Unambiguous characters only, so it can be read out over the phone.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const password = [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
  await db.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } } });
  return { ok: true, email: owner.email, password };
}
