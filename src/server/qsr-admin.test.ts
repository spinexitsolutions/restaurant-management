// Integration tests for counter tokens, partner commission and admin filters. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { findPlan } from "@/lib/plans";
import { adminRestaurants } from "./admin";
import { advanceItems, placeItems } from "./orders";
import { resellerSummary } from "./resellers";
import { applySubscription } from "./subscriptions";
import { tokenBoard } from "./tokens";

describe.skipIf(!process.env.DATABASE_URL)("QSR tokens and partners", () => {
  let orgId: string, restaurantId: string, resellerId: string, tableId: string, coffee: string;
  const order = (tableId?: string, channel?: "ZOMATO") =>
    placeItems({
      restaurantId,
      newOrder: { type: tableId ? "DINE_IN" : "TAKEAWAY", tableId, source: "STAFF", channel },
      lines: [{ itemId: coffee, variantId: null, addonIds: [], quantity: 1 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });

  beforeAll(async () => {
    resellerId = (await db.reseller.create({ data: { name: "Ravi Agent", phone: "9876500000", code: `RAVI${Date.now() % 100000}`, commissionRate: 25 } })).id;
    const r = await db.restaurant.create({
      data: { organization: { create: { name: "Brew", resellerId } }, name: "Brew Cafe QA", slug: `brew-${Date.now()}`, city: "Indore", tokenMode: true, gstEnabled: false, planExpiresAt: new Date(Date.now() + 3 * 86_400_000) },
    });
    restaurantId = r.id;
    orgId = r.organizationId;
    tableId = (await db.diningTable.create({ data: { restaurantId, name: "T1", qrToken: `qa-${Date.now()}` } })).id;
    const cat = await db.category.create({ data: { restaurantId, name: "Coffee" } });
    coffee = (await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name: "Cold Coffee", price: 120 } })).id;
  });
  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.reseller.deleteMany({ where: { id: resellerId } });
    await db.$disconnect();
  });

  it("numbers counter orders 1, 2, 3 (not table orders) and moves them from preparing to ready to gone", async () => {
    const a = (await order()).order;
    const dine = (await order(tableId)).order;
    const b = (await order(undefined, "ZOMATO")).order;
    expect([a.tokenNumber, dine.tokenNumber, b.tokenNumber]).toEqual([1, null, 2]);

    let board = await tokenBoard(restaurantId);
    expect(board.preparing.map((t) => t.token)).toEqual([1, 2]);

    const itemsA = await db.orderItem.findMany({ where: { orderId: a.id } });
    await advanceItems(restaurantId, itemsA.map((i) => i.id), "READY");
    board = await tokenBoard(restaurantId);
    expect(board.preparing.map((t) => t.token)).toEqual([2]);
    expect(board.ready).toEqual([expect.objectContaining({ token: 1, readyItemIds: itemsA.map((i) => i.id) })]);

    const itemsB = await db.orderItem.findMany({ where: { orderId: b.id } });
    await advanceItems(restaurantId, itemsB.map((i) => i.id), "READY");
    expect((await tokenBoard(restaurantId)).ready.map((t) => [t.token, t.label])).toEqual([
      [2, "Zomato"],
      [1, null],
    ]);

    await advanceItems(restaurantId, itemsA.map((i) => i.id), "SERVED"); // handed over
    board = await tokenBoard(restaurantId);
    expect(board.ready.map((t) => t.token)).toEqual([2]);
    // Ready tokens nobody collected drop off the TV after a while.
    expect((await tokenBoard(restaurantId, new Date(Date.now() + 25 * 60_000))).ready).toEqual([]);

    // Tokens restart the next day.
    await db.restaurant.update({ where: { id: restaurantId }, data: { tokenSeqDate: "2000-01-01" } });
    expect((await order()).order.tokenNumber).toBe(1);
  });

  it("gives the partner their share of each payment, once", async () => {
    const plan = findPlan("YEARLY")!;
    const p = await applySubscription(restaurantId, plan, { method: "RAZORPAY", razorpayPaymentId: `pay_qa_${Date.now()}`, razorpayOrderId: "order_qa" });
    await applySubscription(restaurantId, plan, { method: "RAZORPAY", razorpayPaymentId: p.razorpayPaymentId!, razorpayOrderId: "order_qa" }); // webhook retry
    const c = await db.resellerCommission.findMany({ where: { resellerId } });
    expect(c).toHaveLength(1);
    expect(toPaise(c[0].amount)).toBe(Math.round(plan.pricePaise * 0.25)); // on the price before GST

    // Free months don't earn commission.
    await applySubscription(restaurantId, { ...plan, pricePaise: 0 }, { method: "MANUAL", amountPaise: 0, months: 1 });
    await db.resellerPayout.create({ data: { resellerId, amount: 1000 } });
    const s = await resellerSummary(resellerId);
    expect(s).toMatchObject({ earned: Math.round(plan.pricePaise * 0.25), paid: 100000, paying: 1 });
    expect(s.due).toBe(s.earned - 100000);
  });

  it("finds outlets by owner phone and filters renewals due", async () => {
    await db.user.create({ data: { name: "Neha", email: `neha-${Date.now()}@brew.in`, phone: "9811122233", passwordHash: "x", role: "OWNER", restaurantId } });
    await db.restaurant.update({ where: { id: restaurantId }, data: { plan: "TRIAL", planExpiresAt: new Date(Date.now() + 2 * 86_400_000) } });
    expect((await adminRestaurants("all", "9811122233")).map((r) => r.id)).toEqual([restaurantId]);
    const due = await adminRestaurants("due", "Brew Cafe QA");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ reseller: "Ravi Agent", owner: { name: "Neha" }, orders30: 4 });
    expect(await adminRestaurants("paying", "Brew Cafe QA")).toHaveLength(0);
  });
});
