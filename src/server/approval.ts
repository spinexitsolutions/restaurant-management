import "server-only";
import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { lockStatus } from "@/lib/lockout";
import { OrderError } from "./orders";

/** Returned to the client so it can ask for a manager PIN and retry. */
export const PIN_REQUIRED = "PIN_REQUIRED";

const MANAGERS: Role[] = ["OWNER", "MANAGER"];

export interface Actor {
  userId: string;
  restaurantId: string;
  role: Role;
  name: string;
}

/**
 * Owners and managers approve their own actions. Other staff need an owner/manager PIN when the
 * restaurant has PIN approval turned on. Returns the approver's name for the audit log.
 */
export async function approve(actor: Actor, pin: string | undefined): Promise<string | null> {
  if (MANAGERS.includes(actor.role)) return actor.name;
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: actor.restaurantId }, select: { requireManagerPin: true } });
  if (!r.requireManagerPin) return null;
  if (!pin) throw new OrderError(PIN_REQUIRED);

  // Wrong-PIN throttling per staff member: 5 tries per 15 minutes, stored in the database.
  const key = `pin:${actor.userId}`;
  const recent = await db.authAttempt.findMany({ where: { key, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } }, select: { success: true, createdAt: true } });
  const lock = lockStatus(recent, new Date(), 5, 15 * 60_000);
  if (lock.locked) throw new OrderError(`Too many wrong PINs. Try again in ${lock.retryAfterMinutes} minute(s).`);

  const managers = await db.user.findMany({
    where: { restaurantId: actor.restaurantId, role: { in: MANAGERS }, isActive: true, pinHash: { not: null } },
    select: { name: true, pinHash: true },
  });
  if (managers.length === 0) throw new OrderError("No manager has set an approval PIN yet. Ask the owner to set one in Staff.");
  for (const m of managers) {
    if (await bcrypt.compare(pin, m.pinHash!)) {
      await db.authAttempt.create({ data: { key, success: true } });
      return m.name;
    }
  }
  await db.authAttempt.create({ data: { key, success: false } });
  throw new OrderError("Wrong PIN");
}

export async function audit(
  entry: {
    restaurantId: string;
    actor: Pick<Actor, "userId" | "name"> | null;
    approvedBy?: string | null;
    action: string;
    orderId?: string | null;
    details?: Prisma.InputJsonValue;
  },
  tx: Prisma.TransactionClient = db,
) {
  const order = entry.orderId ? await tx.order.findUnique({ where: { id: entry.orderId }, select: { orderNumber: true } }) : null;
  await tx.auditLog.create({
    data: {
      restaurantId: entry.restaurantId,
      userId: entry.actor?.userId,
      userName: entry.actor?.name,
      approvedBy: entry.approvedBy ?? null,
      action: entry.action,
      orderId: entry.orderId ?? null,
      orderNumber: order?.orderNumber ?? null,
      details: entry.details ?? {},
    },
  });
}
