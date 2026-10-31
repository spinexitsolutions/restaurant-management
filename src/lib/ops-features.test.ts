import { describe, expect, it } from "vitest";
import { holdPlan, nextCourse } from "./courses";
import { soldOutItems } from "./inventory";
import { parsePaymentWebhook } from "./razorpay";
import { winbackDue, winbackReturned } from "./winback";

describe("auto sold out", () => {
  const recipe = [
    { ingredientId: "paneer", variantId: null, quantity: 0.2 },
    { ingredientId: "dal", variantId: "half", quantity: 0.15 },
    { ingredientId: "dal", variantId: "full", quantity: 0.25 },
  ];
  it("marks a dish sold out when no portion can be made", () => {
    const items = [
      { id: "tikka", variantIds: [], recipe: [recipe[0]] },
      { id: "dal", variantIds: ["half", "full"], recipe: recipe.slice(1) },
      { id: "chai", variantIds: [], recipe: [] },
    ];
    expect([...soldOutItems(items, new Map([["paneer", 0.1], ["dal", 0.2]]))]).toEqual(["tikka"]); // half dal still possible
    expect([...soldOutItems(items, new Map([["paneer", 0.2], ["dal", 0.1]]))]).toEqual(["dal"]);
    expect(soldOutItems(items, new Map([["paneer", 5], ["dal", 5]])).size).toBe(0);
  });
});

describe("course firing", () => {
  it("holds later courses only when the ticket mixes courses", () => {
    expect(holdPlan([1, 2, 2, 0, 3])).toEqual([false, true, true, false, true]);
    expect(holdPlan([2, 2])).toEqual([false, false]);
    expect(holdPlan([0, 0])).toEqual([false, false]);
    expect(nextCourse([3, 2, 3])).toBe(2);
    expect(nextCourse([])).toBeNull();
  });
});

describe("win-back", () => {
  const now = new Date("2026-10-31T10:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const base = { visits: 3, lastVisitAt: daysAgo(35), lastWinbackAt: null, marketingOptOut: false };
  it("messages lapsed customers once per absence", () => {
    expect(winbackDue(base, now, 30)).toBe(true);
    expect(winbackDue({ ...base, lastVisitAt: daysAgo(10) }, now, 30)).toBe(false);
    expect(winbackDue({ ...base, lastWinbackAt: daysAgo(4) }, now, 30)).toBe(false);
    expect(winbackDue({ ...base, lastWinbackAt: daysAgo(80) }, now, 30)).toBe(true); // came back since, lapsed again
    expect(winbackDue({ ...base, marketingOptOut: true }, now, 30)).toBe(false);
  });
  it("counts who came back", () => {
    expect(winbackReturned([{ lastVisitAt: daysAgo(1), lastWinbackAt: daysAgo(5) }, { lastVisitAt: daysAgo(40), lastWinbackAt: daysAgo(5) }, { lastVisitAt: daysAgo(1), lastWinbackAt: null }])).toEqual({ sent: 2, returned: 1 });
  });
});

describe("razorpay webhook", () => {
  it("reads our order id from payment notes or QR code notes", () => {
    expect(parsePaymentWebhook({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 54000, order_id: "order_9", notes: { orderId: "o1" } } } } })).toEqual({
      orderId: "o1",
      paymentId: "pay_1",
      razorpayOrderId: "order_9",
      amount: 54000,
      qrId: null,
    });
    expect(
      parsePaymentWebhook({ event: "qr_code.credited", payload: { payment: { entity: { id: "pay_2", amount: 100, notes: [] } }, qr_code: { entity: { id: "qr_1", notes: { orderId: "o2" } } } } }),
    ).toEqual({ orderId: "o2", paymentId: "pay_2", razorpayOrderId: null, amount: 100, qrId: "qr_1" });
    expect(parsePaymentWebhook({ event: "refund.created" })).toBeNull();
  });
});
