import { describe, expect, it } from "vitest";
import { addMonths, renewalPeriod, subscriptionStatus, subscriptionTax } from "./plans";

describe("subscription", () => {
  it("charges CGST+SGST in the same state and IGST across states", () => {
    expect(subscriptionTax(99900, "Maharashtra", "maharashtra ")).toEqual({ amount: 99900, cgst: 8991, sgst: 8991, igst: 0, total: 117882 });
    expect(subscriptionTax(99900, "Gujarat", "Maharashtra")).toEqual({ amount: 99900, cgst: 0, sgst: 0, igst: 17982, total: 117882 });
    expect(subscriptionTax(99900, null, "Maharashtra").igst).toBe(0);
  });
  it("adds months without overflowing short months", () => {
    expect(addMonths(new Date("2027-01-31T10:00:00Z"), 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addMonths(new Date("2026-11-15T00:00:00Z"), 12).toISOString()).toBe("2027-11-15T00:00:00.000Z");
  });
  it("renews from the current expiry, or from now if lapsed", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(renewalPeriod(new Date("2026-11-10T00:00:00Z"), 1, now).end.toISOString()).toBe("2026-12-10T00:00:00.000Z");
    expect(renewalPeriod(new Date("2026-10-01T00:00:00Z"), 1, now).start).toEqual(now);
  });
  it("gives a short grace period before expiring", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(subscriptionStatus(new Date("2026-11-04T12:00:00Z"), now)).toEqual({ state: "ACTIVE", daysLeft: 5 });
    expect(subscriptionStatus(new Date("2026-10-29T12:00:00Z"), now).state).toBe("GRACE");
    expect(subscriptionStatus(new Date("2026-10-20T12:00:00Z"), now).state).toBe("EXPIRED");
  });
});
