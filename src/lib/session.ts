import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

// Edge-safe session helpers (used by middleware too, so no Node-only imports here).

export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  userId: string;
  restaurantId: string | null;
  role: Role;
  name: string;
  v?: number; // user's sessionVersion when signed in
  imp?: string; // platform admin's user id when they are logged in as this user for support
  impName?: string;
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

/** Support sessions (admin logged in as an owner) expire quickly. */
export const SUPPORT_MAX_AGE_SECONDS = 60 * 60 * 2;

export async function signSession(payload: SessionPayload, maxAgeSeconds = MAX_AGE_SECONDS): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
