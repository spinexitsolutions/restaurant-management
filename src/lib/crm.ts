// Birthday / anniversary helpers. Dates are stored as "MM-DD" so the year doesn't matter.

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidMonthDay(v: string): boolean {
  if (!MMDD.test(v)) return false;
  const [m, d] = v.split("-").map(Number);
  return d <= new Date(Date.UTC(2024, m, 0)).getUTCDate(); // 2024 is a leap year, so 02-29 is allowed
}

/** Days from `todayIso` (yyyy-mm-dd) until the next occurrence of `mmdd`; 0 means today. */
export function daysUntil(mmdd: string, todayIso: string): number {
  const [y, m, d] = todayIso.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  const [mm, dd] = mmdd.split("-").map(Number);
  for (const year of [y, y + 1, y + 2, y + 3, y + 4]) {
    const t = Date.UTC(year, mm - 1, dd);
    // Feb 29 only exists in leap years; Date.UTC would roll it into March.
    if (new Date(t).getUTCMonth() !== mm - 1) continue;
    if (t >= today) return Math.round((t - today) / 86_400_000);
  }
  return Infinity;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
}

export function formatMonthDay(mmdd: string): string {
  const [m, d] = mmdd.split("-").map(Number);
  return new Date(Date.UTC(2024, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
