import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function createSession(payload: SessionPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(payload), sessionCookieOptions);
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Session of an active restaurant staff member, optionally limited to some roles.
 * Role and active status are re-read from the database so that deactivating a user
 * or changing their role takes effect immediately, not when their cookie expires.
 */
export async function requireRestaurantSession(roles?: Role[]) {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, role: true, isActive: true, restaurantId: true, restaurant: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || !user.restaurantId || !user.restaurant?.isActive) redirect("/login?expired=1");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return { userId: session.userId, restaurantId: user.restaurantId, role: user.role, name: user.name };
}

export const MANAGE_ROLES: Role[] = ["OWNER", "MANAGER"];
