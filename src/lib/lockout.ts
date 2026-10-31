// Sign-in throttling decisions. Pure so they can be unit-tested; storage lives in src/server/auth-guard.ts.

export interface Attempt {
  success: boolean;
  createdAt: Date;
}

/**
 * Locked when `limit` failures happened within `windowMs`, counting only failures after the last success.
 * The lock lifts `windowMs` after the oldest of those failures.
 */
export function lockStatus(attempts: Attempt[], now: Date, limit: number, windowMs: number): { locked: boolean; retryAfterMinutes: number } {
  const since = now.getTime() - windowMs;
  const lastSuccess = Math.max(0, ...attempts.filter((a) => a.success).map((a) => a.createdAt.getTime()));
  const failures = attempts
    .filter((a) => !a.success && a.createdAt.getTime() > since && a.createdAt.getTime() > lastSuccess)
    .map((a) => a.createdAt.getTime())
    .sort((a, b) => a - b);
  if (failures.length < limit) return { locked: false, retryAfterMinutes: 0 };
  const unlockAt = failures[failures.length - limit] + windowMs;
  return { locked: true, retryAfterMinutes: Math.max(1, Math.ceil((unlockAt - now.getTime()) / 60000)) };
}

export function maskPhone(phone: string) {
  return phone.length >= 4 ? `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : phone;
}
