import "server-only";
import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { OrderError } from "./orders";

/** Returned to the client so it can ask for a manager PIN and retry. */
export const PIN_REQUIRED = "PIN_REQUIRED";

const MANAGERS: Role[] = ["OWNER", "MANAGER"];

// Wrong-PIN throttling per user. In-memory, so it resets on restart and is per server instance;
// good enough to stop a cashier guessing at the counter.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

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

  const f = failures.get(actor.userId);
  if (f && f.until > Date.now()) throw new OrderError("Too many wrong PINs. Try again in a few minutes.");

  const managers = await db.user.findMany({
    where: { restaurantId: actor.restaurantId, role: { in: MANAGERS }, isActive: true, pinHash: { not: null } },
    select: { name: true, pinHash: true },
  });
  if (managers.length === 0) throw new OrderError("No manager has set an approval PIN yet. Ask the owner to set one in Staff.");
  for (const m of managers) {
    if (await bcrypt.compare(pin, m.pinHash!)) {
      failures.delete(actor.userId);
      return m.name;
    }
  }
  const count = (f?.count ?? 0) + 1;
  failures.set(actor.userId, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
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
