import { describe, expect, it } from "vitest";
import { lockStatus } from "./lockout";

const now = new Date("2026-10-31T12:00:00Z");
const ago = (min: number, success = false) => ({ success, createdAt: new Date(now.getTime() - min * 60000) });

describe("lockStatus", () => {
  const W = 15 * 60000;
  it("locks after 5 recent failures and says when it lifts", () => {
    expect(lockStatus([ago(1), ago(2), ago(3), ago(4)], now, 5, W).locked).toBe(false);
    expect(lockStatus([ago(1), ago(2), ago(3), ago(4), ago(10)], now, 5, W)).toEqual({ locked: true, retryAfterMinutes: 5 });
  });
  it("ignores failures older than the window", () => {
    expect(lockStatus([ago(1), ago(2), ago(3), ago(4), ago(20)], now, 5, W).locked).toBe(false);
  });
  it("resets after a successful sign-in", () => {
    expect(lockStatus([ago(1), ago(2), ago(3, true), ago(4), ago(5), ago(6)], now, 5, W).locked).toBe(false);
  });
});
