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

/** Starts a session for a user; it stays valid until their next password reset. */
export async function signIn(user: { id: string; restaurantId: string | null; role: Role; name: string; sessionVersion: number }) {
  await createSession({ userId: user.id, restaurantId: user.restaurantId, role: user.role, name: user.name, v: user.sessionVersion });
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
    select: { name: true, role: true, isActive: true, sessionVersion: true, restaurantId: true, restaurant: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || !user.restaurantId || !user.restaurant?.isActive || user.sessionVersion !== (session.v ?? 0)) redirect("/login?expired=1");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return { userId: session.userId, restaurantId: user.restaurantId, role: user.role, name: user.name };
}

export const MANAGE_ROLES: Role[] = ["OWNER", "MANAGER"];

/**
 * For API routes: the signed-in, still-active user (role read from the database), or null.
 * Rejects sessions issued before the user's last password reset.
 */
export async function getValidUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, isActive: true, sessionVersion: true, restaurantId: true, restaurant: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || user.sessionVersion !== (session.v ?? 0)) return null;
  if (user.restaurantId && !user.restaurant?.isActive) return null;
  return user;
}
