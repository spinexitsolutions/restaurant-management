// Integration tests for coupon codes on orders. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { applyCouponCode, cancelOrder, generateBill, placeItems, recordPayment, reopenBill, setDiscount, setOrderCustomer } from "./orders";
import { getOrderView } from "./order-view";

describe.skipIf(!process.env.DATABASE_URL)("coupons", () => {
  let orgId: string;
  let restaurantId: string;
  let thali: string;

  const order = async (qty: number, phone?: string) => {
    const { order: o } = await placeItems({
      restaurantId,
      newOrder: { type: "TAKEAWAY", source: "STAFF" },
      lines: [{ itemId: thali, variantId: null, addonIds: [], quantity: qty }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    if (phone) await setOrderCustomer(restaurantId, o.id, phone, "Asha");
    return o;
  };
  const pay = async (id: string) => {
    const o = await db.order.findUniqueOrThrow({ where: { id } });
    await recordPayment(restaurantId, id, { method: "CASH", amountPaise: toPaise(o.grandTotal!) });
  };

  beforeAll(async () => {
    const r = await db.restaurant.create({ data: { organization: { create: { name: "CP" } }, name: "CP", slug: `cp-${Date.now()}`, gstEnabled: true, gstMode: "EXCLUSIVE" } });
    restaurantId = r.id;
    orgId = r.organizationId;
    const cat = await db.category.create({ data: { restaurantId, name: "Meals" } });
    thali = (await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name: "Thali", price: 200, gstRate: 5 } })).id;
    await db.coupon.createMany({
      data: [
        { restaurantId, code: "FIRST50", type: "PERCENT", value: 50, maxDiscount: 150, firstOrderOnly: true },
        { restaurantId, code: "WEEKEND20", type: "PERCENT", value: 20, minBill: 500 },
        { restaurantId, code: "FLAT100", type: "FLAT", value: 100, usageLimit: 1 },
        { restaurantId, code: "OLD", type: "FLAT", value: 10, validTo: new Date(Date.now() - 86_400_000) },
      ],
    });
  });

  afterAll(async () => {
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("applies a percent coupon with a cap, taxes the discounted amount and records the redemption", async () => {
    const o = await order(5, "9876500001"); // ₹1000
    expect(await applyCouponCode(restaurantId, o.id, " first 50 ")).toEqual({ code: "FIRST50", description: expect.stringContaining("50% off") });
    const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const live = (await getOrderView(r, o.id))!;
    expect(live.coupon?.code).toBe("FIRST50");
    expect(live.bill.discount).toBe(15000); // capped at ₹150

    await generateBill(restaurantId, o.id);
    const billed = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(toPaise(billed.discountAmount!)).toBe(15000);
    expect(billed.discountNote).toBe("Coupon FIRST50");
    expect(toPaise(billed.cgst!) + toPaise(billed.sgst!)).toBe(4250); // 5% of ₹850
    const red = await db.couponRedemption.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(toPaise(red.amount)).toBe(15000);
    expect(red.customerId).toBe(billed.customerId);

    // Re-billing after a reopen doesn't count the coupon twice.
    await reopenBill(restaurantId, o.id);
    expect(await db.couponRedemption.count({ where: { orderId: o.id } })).toBe(0);
    await generateBill(restaurantId, o.id);
    expect(await db.couponRedemption.count({ where: { orderId: o.id } })).toBe(1);
    await pay(o.id);

    // Same customer, second order: first-order coupon refused.
    const again = await order(1, "9876500001");
    await expect(applyCouponCode(restaurantId, again.id, "FIRST50")).rejects.toThrow(/first order/);
    // Without a mobile number it can't be checked.
    const anon = await order(1);
    await expect(applyCouponCode(restaurantId, anon.id, "FIRST50")).rejects.toThrow(/mobile/);
  });

  it("enforces minimum bill, expiry, unknown codes and total usage", async () => {
    const small = await order(1); // ₹200
    await expect(applyCouponCode(restaurantId, small.id, "WEEKEND20")).rejects.toThrow(/at least ₹500/);
    await expect(applyCouponCode(restaurantId, small.id, "OLD")).rejects.toThrow(/expired/);
    await expect(applyCouponCode(restaurantId, small.id, "NOPE")).rejects.toThrow(/No such coupon/);

    const a = await order(1);
    await applyCouponCode(restaurantId, a.id, "FLAT100");
    const b = await order(1);
    await applyCouponCode(restaurantId, b.id, "FLAT100"); // allowed while nothing is billed yet
    await generateBill(restaurantId, a.id);
    // The last use was taken by order A, so billing B fails and tells staff what to do.
    await expect(generateBill(restaurantId, b.id)).rejects.toThrow(/fully used.*Remove the coupon/);
    await applyCouponCode(restaurantId, b.id, "");
    await generateBill(restaurantId, b.id);

    // Cancelling A frees the use again.
    await cancelOrder(restaurantId, a.id, "test");
    expect(await db.couponRedemption.count({ where: { orderId: a.id } })).toBe(0);
  });

  it("drops the coupon when a manual discount is applied, and the bill drops below the minimum", async () => {
    const o = await order(3); // ₹600
    await applyCouponCode(restaurantId, o.id, "WEEKEND20");
    await setDiscount(restaurantId, o.id, { type: "FLAT", value: 50, note: "" });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).couponId).toBeNull();

    await applyCouponCode(restaurantId, o.id, "WEEKEND20");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: o.id } });
    await db.orderItem.update({ where: { id: item.id }, data: { quantity: 2 } }); // ₹400 now
    await expect(generateBill(restaurantId, o.id)).rejects.toThrow(/at least ₹500/);
  });
});
