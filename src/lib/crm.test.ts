import { describe, expect, it } from "vitest";
import { daysUntil, fillTemplate, formatMonthDay, isValidMonthDay } from "./crm";

describe("crm dates", () => {
  it("validates month-day strings", () => {
    expect(isValidMonthDay("02-29")).toBe(true);
    expect(isValidMonthDay("04-31")).toBe(false);
    expect(isValidMonthDay("13-01")).toBe(false);
  });
  it("counts days to the next occurrence, across the new year", () => {
    expect(daysUntil("10-30", "2026-10-30")).toBe(0);
    expect(daysUntil("11-02", "2026-10-30")).toBe(3);
    expect(daysUntil("01-02", "2026-12-30")).toBe(3);
    expect(daysUntil("10-29", "2026-10-30")).toBe(364);
  });
  it("finds the next leap day", () => {
    expect(daysUntil("02-29", "2027-02-01")).toBe(393); // 29 Feb 2028
  });
  it("fills templates and formats dates", () => {
    expect(fillTemplate("Hi {name}, from {restaurant} {x}", { name: "Asha", restaurant: "Dhaba" })).toBe("Hi Asha, from Dhaba {x}");
    expect(formatMonthDay("11-05")).toBe("5 Nov");
  });
});
