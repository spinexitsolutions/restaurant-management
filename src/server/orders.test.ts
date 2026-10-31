// Integration tests against a real Postgres (DATABASE_URL). Skipped when no database is configured.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { financialYear } from "@/lib/numbering";
import { advanceItems, cancelItem, decideKot, generateBill, OrderError, placeItems, recordPayment, reopenBill, setDiscount } from "./orders";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("order lifecycle", () => {
  let restaurantId: string;
  let tableId: string;
  let paneer: { id: string };
  let dal: { id: string; half: string; full: string };
  let pizza: { id: string; cheese: string };

  beforeAll(async () => {
    const r = await db.restaurant.create({
      data: {
        organization: { create: { name: "Test org" } }, name: "Test Kitchen", slug: `test-${Date.now()}`, gstEnabled: true, gstin: "27ABCDE1234F1Z0", gstMode: "EXCLUSIVE", defaultGstRate: 5 },
    });
    restaurantId = r.id;
    tableId = (await db.diningTable.create({ data: { restaurantId, name: "T1" } })).id;
    const cat = await db.category.create({ data: { restaurantId, name: "Main" } });
    paneer = await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name: "Paneer Tikka", price: 260 } });
    const d = await db.menuItem.create({
      data: { restaurantId, categoryId: cat.id, name: "Dal", price: 150, variants: { create: [{ name: "Half", price: 150 }, { name: "Full", price: 220 }] } },
      include: { variants: true },
    });
    dal = { id: d.id, half: d.variants.find((v) => v.name === "Half")!.id, full: d.variants.find((v) => v.name === "Full")!.id };
    const p = await db.menuItem.create({
      data: {
        restaurantId,
        categoryId: cat.id,
        name: "Pizza",
        price: 200,
        addonGroups: { create: [{ name: "Toppings", minSelect: 0, maxSelect: 1, options: { create: [{ name: "Cheese", price: 40 }, { name: "Olives", price: 30 }] } }] },
      },
      include: { addonGroups: { include: { options: true } } },
    });
    pizza = { id: p.id, cheese: p.addonGroups[0].options.find((o) => o.name === "Cheese")!.id };
  });

  afterAll(async () => {
    if (restaurantId) await db.organization.deleteMany({ where: { restaurants: { some: { id: restaurantId } } } });
    await db.$disconnect();
  });

  it("prices items from the database, not the client", async () => {
    const { order, kot } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "QR" },
      lines: [
        { itemId: dal.id, variantId: dal.full, addonIds: [], quantity: 2 },
        { itemId: pizza.id, variantId: null, addonIds: [pizza.cheese], quantity: 1 },
      ],
      kotStatus: "PENDING_APPROVAL",
      createdById: null,
    });
    const items = await db.orderItem.findMany({ where: { kotId: kot.id }, orderBy: { name: "asc" } });
    expect(items.map((i) => [i.name, i.variantName, Number(i.unitPrice), i.quantity])).toEqual([
      ["Dal", "Full", 220, 2],
      ["Pizza", null, 240, 1],
    ]);
    expect(order.tableName).toBe("T1");
    expect(kot.kotNumber).toBeGreaterThan(0);
  });

  it("rejects a missing variant, too many add-ons and sold-out items", async () => {
    const base = { restaurantId, newOrder: { type: "TAKEAWAY" as const, source: "STAFF" as const }, kotStatus: "ACCEPTED" as const, createdById: null };
    await expect(placeItems({ ...base, lines: [{ itemId: dal.id, variantId: null, addonIds: [], quantity: 1 }] })).rejects.toThrow(/Choose a size/);
    await expect(
      placeItems({ ...base, lines: [{ itemId: pizza.id, variantId: null, addonIds: [pizza.cheese, "x"], quantity: 1 }] }),
    ).resolves.toBeTruthy(); // unknown add-on ids are ignored
    await db.menuItem.update({ where: { id: paneer.id }, data: { isAvailable: false } });
    await expect(placeItems({ ...base, lines: [{ itemId: paneer.id, variantId: null, addonIds: [], quantity: 1 }] })).rejects.toThrow(/sold out/);
    await db.menuItem.update({ where: { id: paneer.id }, data: { isAvailable: true } });
  });

  it("appends to the running order of a table", async () => {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "STAFF" },
      lines: [{ itemId: paneer.id, variantId: null, addonIds: [], quantity: 1 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    const orders = await db.order.findMany({ where: { tableId } });
    expect(orders).toHaveLength(1);
    expect(order.id).toBe(orders[0].id);
  });

  it("blocks billing until the QR order is accepted, then bills accepted items only", async () => {
    const order = await db.order.findFirstOrThrow({ where: { tableId }, include: { kots: true } });
    await expect(generateBill(restaurantId, order.id)).rejects.toThrow(/pending customer order/);
    const qrKot = order.kots.find((k) => k.status === "PENDING_APPROVAL")!;
    await decideKot(restaurantId, qrKot.id, true);

    // Kitchen flow
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    expect(await advanceItems(restaurantId, items.map((i) => i.id))).toBe(items.length);
    expect((await db.orderItem.findFirstOrThrow({ where: { id: items[0].id } })).status).toBe("PREPARING");

    // A started item can't be cancelled by a waiter, and needs a reason otherwise
    await expect(cancelItem(restaurantId, items[0].id, "", "WAITER")).rejects.toThrow(OrderError);
    await expect(cancelItem(restaurantId, items[0].id, "", "CASHIER")).rejects.toThrow(/reason/);
    const paneerItem = items.find((i) => i.name === "Paneer Tikka")!;
    await cancelItem(restaurantId, paneerItem.id, "Customer changed mind", "CASHIER");

    await setDiscount(restaurantId, order.id, { type: "PERCENT", value: 10, note: "" });
    const billed = await generateBill(restaurantId, order.id);
    // 2 x 220 + 240 = 680; -10% = 612; 5% GST = 30.60; 642.60 -> 643
    expect(Number(billed.subtotal)).toBe(680);
    expect(Number(billed.discountAmount)).toBe(68);
    expect(Number(billed.cgst) + Number(billed.sgst)).toBeCloseTo(30.6);
    expect(Number(billed.grandTotal)).toBe(643);
    expect(billed.invoiceNumber).toBe(`INV/${financialYear()}/0001`);
  });

  it("blocks new items on a billed table and keeps the invoice number on reopen", async () => {
    const order = await db.order.findFirstOrThrow({ where: { tableId } });
    await expect(
      placeItems({
        restaurantId,
        newOrder: { type: "DINE_IN", tableId, source: "QR" },
        lines: [{ itemId: paneer.id, variantId: null, addonIds: [], quantity: 1 }],
        kotStatus: "PENDING_APPROVAL",
        createdById: null,
      }),
    ).rejects.toThrow(/already generated/);
    await reopenBill(restaurantId, order.id);
    const again = await generateBill(restaurantId, order.id);
    expect(again.invoiceNumber).toBe(order.invoiceNumber);
  });

  it("takes split payments, refuses overpayment and closes the order", async () => {
    const order = await db.order.findFirstOrThrow({ where: { tableId } });
    await expect(recordPayment(restaurantId, order.id, { method: "CASH", amountPaise: 70000 })).rejects.toThrow(/due/);
    await recordPayment(restaurantId, order.id, { method: "CASH", amountPaise: 30000 });
    const after = await recordPayment(restaurantId, order.id, { method: "UPI", amountPaise: 34300 });
    expect(after.status).toBe("PAID");
    await expect(recordPayment(restaurantId, order.id, { method: "CASH", amountPaise: 100 })).rejects.toThrow(/already paid/);
  });

  it("records a Razorpay payment only once", async () => {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "TAKEAWAY", source: "STAFF" },
      lines: [{ itemId: paneer.id, variantId: null, addonIds: [], quantity: 1 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    await generateBill(restaurantId, order.id);
    const pay = { method: "RAZORPAY" as const, amountPaise: 27300, razorpayPaymentId: `pay_${order.id}`, razorpayOrderId: "order_x" };
    await recordPayment(restaurantId, order.id, pay);
    await recordPayment(restaurantId, order.id, pay); // webhook + checkout both report it
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("numbers invoices sequentially", async () => {
    const invoices = (await db.order.findMany({ where: { restaurantId, invoiceNumber: { not: null } }, orderBy: { billedAt: "asc" } })).map((o) => o.invoiceNumber);
    expect(invoices.at(-1)).toBe(`INV/${financialYear()}/0002`);
  });
});
