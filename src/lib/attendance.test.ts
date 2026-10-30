import { describe, expect, it } from "vitest";
import { formatHours, shiftMs, summarize } from "./attendance";

const t = (s: string) => new Date(`2026-10-30T${s}:00+05:30`);

describe("attendance", () => {
  it("counts an open shift up to now and caps forgotten ones", () => {
    expect(shiftMs(t("09:00"), t("17:30"))).toBe(8.5 * 3_600_000);
    expect(shiftMs(t("09:00"), null, t("12:00"))).toBe(3 * 3_600_000);
    expect(shiftMs(t("09:00"), null, new Date(t("09:00").getTime() + 40 * 3_600_000))).toBe(16 * 3_600_000);
  });
  it("adds up days and hours per person, including split shifts", () => {
    const s = summarize(
      [
        { userId: "a", businessDate: "2026-10-30", clockIn: t("09:00"), clockOut: t("13:00") },
        { userId: "a", businessDate: "2026-10-30", clockIn: t("17:00"), clockOut: t("22:30") },
        { userId: "b", businessDate: "2026-10-30", clockIn: t("10:00"), clockOut: null },
      ],
      t("12:00"),
    );
    expect(s.get("a")).toEqual({ days: 1, hours: 9.5, open: false });
    expect(s.get("b")).toEqual({ days: 1, hours: 2, open: true });
    expect(formatHours(9.5 * 3_600_000)).toBe("9h 30m");
  });
});
