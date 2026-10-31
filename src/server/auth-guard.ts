import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { lockStatus } from "@/lib/lockout";

const WINDOW_MS = 15 * 60_000;
const LIMITS = { account: 5, ip: 30 } as const;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

async function status(key: string, limit: number) {
  const attempts = await db.authAttempt.findMany({
    where: { key, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    select: { success: true, createdAt: true },
  });
  return lockStatus(attempts, new Date(), limit, WINDOW_MS);
}

/** Returns a message if this account or IP is temporarily locked out, else null. */
export async function lockMessage(accountKey: string, ip: string): Promise<string | null> {
  const [acct, net] = await Promise.all([status(accountKey, LIMITS.account), status(`ip:${ip}`, LIMITS.ip)]);
  const s = acct.locked ? acct : net.locked ? net : null;
  return s ? `Too many failed attempts. Try again in ${s.retryAfterMinutes} minute${s.retryAfterMinutes === 1 ? "" : "s"}, or reset your password.` : null;
}

export async function recordAttempt(accountKey: string, ip: string, success: boolean) {
  await db.authAttempt.createMany({
    data: success ? [{ key: accountKey, success }] : [{ key: accountKey, success }, { key: `ip:${ip}`, success }],
  });
  // Keep the table small.
  if (Math.random() < 0.02) await db.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}
