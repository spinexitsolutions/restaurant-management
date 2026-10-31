import { describe, expect, it } from "vitest";
import { couponDiscount, couponProblem, describeCoupon, normaliseCode, type CouponRule } from "./coupons";

const base: CouponRule = {
  code: "WEEKEND20",
  type: "PERCENT",
  value: 20,
  maxDiscount: 15000,
  minBill: 50000,
  validFrom: new Date("2026-10-01T00:00:00Z"),
  validTo: new Date("2026-11-30T00:00:00Z"),
  usageLimit: 100,
  perCustomerLimit: null,
  firstOrderOnly: false,
  isActive: true,
};
const ctx = { now: new Date("2026-10-31T10:00:00Z"), subtotal: 60000, usedTotal: 0, customer: null };

describe("coupons", () => {
  it("normalises codes", () => expect(normaliseCode(" first 50 ")).toBe("FIRST50"));

  it("caps percent discounts and never exceeds the bill", () => {
    expect(couponDiscount(base, 60000)).toBe(12000);
    expect(couponDiscount(base, 100000)).toBe(15000);
    expect(couponDiscount({ type: "FLAT", value: 10000, maxDiscount: null }, 8000)).toBe(8000);
  });

  it("checks status, dates, limits and minimum bill", () => {
    expect(couponProblem(base, ctx)).toBeNull();
    expect(couponProblem({ ...base, isActive: false }, ctx)).toMatch(/no longer active/);
    expect(couponProblem(base, { ...ctx, now: new Date("2026-12-01T00:00:00Z") })).toMatch(/expired/);
    expect(couponProblem(base, { ...ctx, now: new Date("2026-09-01T00:00:00Z") })).toMatch(/starts on/);
    expect(couponProblem(base, { ...ctx, usedTotal: 100 })).toMatch(/fully used/);
    expect(couponProblem(base, { ...ctx, subtotal: 40000 })).toMatch(/at least ₹500/);
  });

  it("needs the customer for first-order and per-customer coupons", () => {
    const first = { ...base, code: "FIRST50", firstOrderOnly: true };
    expect(couponProblem(first, ctx)).toMatch(/mobile number/);
    expect(couponProblem(first, { ...ctx, customer: { visits: 2, usedThisCoupon: 0 } })).toMatch(/first order/);
    expect(couponProblem(first, { ...ctx, customer: { visits: 0, usedThisCoupon: 0 } })).toBeNull();
    const once = { ...base, perCustomerLimit: 1 };
    expect(couponProblem(once, { ...ctx, customer: { visits: 3, usedThisCoupon: 1 } })).toMatch(/already used/);
  });

  it("describes itself", () => {
    expect(describeCoupon(base)).toBe("20% off up to ₹150 on bills over ₹500");
    expect(describeCoupon({ type: "FLAT", value: 5000, maxDiscount: null, minBill: 0 })).toBe("₹50 off");
  });
});
