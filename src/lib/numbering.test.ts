import { describe, expect, it } from "vitest";
import { financialYear, formatInvoiceNumber, istDate } from "./numbering";

describe("numbering", () => {
  it("uses the IST calendar date", () => {
    // 20:00 UTC on 30 Oct is already 31 Oct in India
    expect(istDate(new Date("2026-10-30T20:00:00Z"))).toBe("2026-10-31");
  });
  it("rolls the financial year over on 1 April IST", () => {
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("26-27"); // 31 Mar 23:30 IST
    expect(financialYear(new Date("2027-03-31T18:31:00Z"))).toBe("27-28"); // 1 Apr 00:01 IST
    expect(financialYear(new Date("2026-10-30T10:00:00Z"))).toBe("26-27");
  });
  it("keeps invoice numbers within 16 characters", () => {
    const n = formatInvoiceNumber("INV", "26-27", 42);
    expect(n).toBe("INV/26-27/0042");
    expect(formatInvoiceNumber("ABCDE", "26-27", 9999).length).toBeLessThanOrEqual(16);
  });
});
