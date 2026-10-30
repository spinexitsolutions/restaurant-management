// Day and financial-year helpers in Indian Standard Time, used for order/KOT/invoice numbering.

const IST = "Asia/Kolkata";

/** "2026-10-30" for the given instant in IST. */
export function istDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Indian financial year (April-March) as "26-27". */
export function financialYear(at: Date = new Date()): string {
  const [y, m] = istDate(at).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** GST invoice numbers must be unique per financial year and at most 16 characters. */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}
