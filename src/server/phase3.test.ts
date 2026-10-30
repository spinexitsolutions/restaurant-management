// Integration tests for table operations, approvals and offline retries. Need DATABASE_URL.
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approve, PIN_REQUIRED } from "./approval";
import { generateBill, mergeOrders, placeItems, recordPayment, splitOrder, transferOrder } from "./orders";

describe.skipIf(!process.env.DATABASE_URL)("phase 3 operations", () => {
  let restaurantId: string;
  let t1: string, t2: string, t3: string;
  let itemId: string;
  let cashierId: string;

  const order = (tableId: string, quantity = 1, clientRequestId?: string) =>
    placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "STAFF" },
      lines: [{ itemId, variantId: null, addonIds: [], quantity }],
      kotStatus: "ACCEPTED",
      createdById: null,
      clientRequestId,
    });

  beforeAll(async () => {
    const r = await db.restaurant.create({ data: { organization: { create: { name: "Test org" } }, name: "P3", slug: `p3-${Date.now()}`, gstEnabled: false } });
    restaurantId = r.id;
    [t1, t2, t3] = await Promise.all(["T1", "T2", "T3"].map(async (name) => (await db.diningTable.create({ data: { restaurantId, name } })).id));
    const cat = await db.category.create({ data: { restaurantId, name: "Main" } });
    itemId = (await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name: "Thali", price: 200 } })).id;
    await db.user.create({ data: { restaurantId, name: "Owner", email: `o-${r.id}@t.in`, passwordHash: "x", role: "OWNER", pinHash: await bcrypt.hash("4826", 4) } });
    cashierId = (await db.user.create({ data: { restaurantId, name: "Cashier", email: `c-${r.id}@t.in`, passwordHash: "x", role: "CASHIER" } })).id;
  });

  afterAll(async () => {
    if (restaurantId) await db.organization.deleteMany({ where: { restaurants: { some: { id: restaurantId } } } });
    await db.$disconnect();
  });

  it("does not duplicate a KOT or payment retried by an offline device", async () => {
    const a = await order(t3, 1, "req-kot-1");
    const b = await order(t3, 1, "req-kot-1");
    expect(b.kot.id).toBe(a.kot.id);
    expect(await db.kot.count({ where: { orderId: a.order.id } })).toBe(1);

    await generateBill(restaurantId, a.order.id);
    await recordPayment(restaurantId, a.order.id, { method: "CASH", amountPaise: 10000, clientRequestId: "req-pay-1" });
    await recordPayment(restaurantId, a.order.id, { method: "CASH", amountPaise: 10000, clientRequestId: "req-pay-1" });
    expect(await db.payment.count({ where: { orderId: a.order.id } })).toBe(1);
    const closed = await recordPayment(restaurantId, a.order.id, { method: "UPI", amountPaise: 10000, clientRequestId: "req-pay-2" });
    expect(closed.status).toBe("PAID"); // table T3 is free again
  });

  it("moves an order to a free table only", async () => {
    const a = await order(t1);
    await order(t2);
    await expect(transferOrder(restaurantId, a.order.id, t2)).rejects.toThrow(/already has a running order/);
    const moved = await transferOrder(restaurantId, a.order.id, t3);
    expect(moved).toEqual({ from: "T1", to: "T3" });
    expect((await db.order.findUniqueOrThrow({ where: { id: a.order.id } })).tableId).toBe(t3);
  });

  it("merges one table's order into another and frees it", async () => {
    const target = await db.order.findFirstOrThrow({ where: { tableId: t3, status: "OPEN" } });
    const source = await db.order.findFirstOrThrow({ where: { tableId: t2, status: "OPEN" } });
    await db.order.update({ where: { id: source.id }, data: { discountType: "PERCENT", discountValue: 10 } });
    await expect(mergeOrders(restaurantId, target.id, source.id)).rejects.toThrow(/has a discount/);
    await db.order.update({ where: { id: source.id }, data: { discountType: null, discountValue: null } });
    await mergeOrders(restaurantId, target.id, source.id);
    expect(await db.orderItem.count({ where: { orderId: target.id } })).toBe(2);
    const closed = await db.order.findUniqueOrThrow({ where: { id: source.id } });
    expect(closed.status).toBe("CANCELLED");
    expect(closed.cancelReason).toMatch(/Merged into order/);
  });

  it("splits part of a line into a new bill", async () => {
    const { order: o } = await order(t1, 3);
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: o.id } });
    await expect(splitOrder(restaurantId, o.id, [{ itemId: item.id, quantity: 3 }], cashierId)).rejects.toThrow(/at least one item/);
    const split = await splitOrder(restaurantId, o.id, [{ itemId: item.id, quantity: 2 }], cashierId);
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(1);
    const moved = await db.orderItem.findFirstOrThrow({ where: { orderId: split.id } });
    expect(moved.quantity).toBe(2);
    expect(split.tableName).toBe("T1 (split)");
    expect(split.tableId).toBeNull();
    const [a, b] = await Promise.all([generateBill(restaurantId, o.id), generateBill(restaurantId, split.id)]);
    expect(Number(a.grandTotal) + Number(b.grandTotal)).toBe(600);
  });

  it("requires a valid manager PIN from a cashier", async () => {
    const cashier = { userId: cashierId, restaurantId, role: "CASHIER" as const, name: "Cashier" };
    await expect(approve(cashier, undefined)).rejects.toThrow(PIN_REQUIRED);
    await expect(approve(cashier, "1111")).rejects.toThrow(/Wrong PIN/);
    await expect(approve(cashier, "4826")).resolves.toBe("Owner");
    await expect(approve({ ...cashier, role: "MANAGER", name: "Meena" }, undefined)).resolves.toBe("Meena");
    await db.restaurant.update({ where: { id: restaurantId }, data: { requireManagerPin: false } });
    await expect(approve(cashier, undefined)).resolves.toBeNull();
  });
});
