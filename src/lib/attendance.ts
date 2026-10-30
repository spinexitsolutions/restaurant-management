// Attendance summaries. A shift still open counts up to `now`, capped at 16 hours so a forgotten clock-out
// doesn't inflate totals.

const MAX_SHIFT_MS = 16 * 3_600_000;

export function shiftMs(clockIn: Date, clockOut: Date | null, now: Date = new Date()): number {
  const end = clockOut ?? now;
  return Math.max(0, Math.min(end.getTime() - clockIn.getTime(), MAX_SHIFT_MS));
}

export function summarize(rows: { userId: string; businessDate: string; clockIn: Date; clockOut: Date | null }[], now: Date = new Date()) {
  const by = new Map<string, { days: Set<string>; ms: number; open: boolean }>();
  for (const r of rows) {
    const s = by.get(r.userId) ?? { days: new Set<string>(), ms: 0, open: false };
    s.days.add(r.businessDate);
    s.ms += shiftMs(r.clockIn, r.clockOut, now);
    if (!r.clockOut) s.open = true;
    by.set(r.userId, s);
  }
  return new Map([...by].map(([id, s]) => [id, { days: s.days.size, hours: Math.round((s.ms / 3_600_000) * 10) / 10, open: s.open }]));
}

export function formatHours(ms: number) {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
