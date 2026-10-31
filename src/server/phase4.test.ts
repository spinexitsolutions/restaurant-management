// Integration tests for inventory, loyalty and reservations. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelItem, decideKot, generateBill, placeItems, recordPayment, redeemPoints, reopenBill, setOrderCustomer } from "./orders";
import { createReservation } from "./reservations";

describe.skipIf(!process.env.DATABASE_URL)("phase 4", () => {
  let restaurantId: string;
  let tableId: string;
  let dal: { id: string; half: string; full: string };
  let dalIng: string, butterIng: string;

  const stock = async (id: string) => Number((await db.ingredient.findUniqueOrThrow({ where: { id } })).currentStock);

  beforeAll(async () => {
    const r = await db.restaurant.create({
      data: {
        organization: { create: { name: "Test org" } }, name: "P4", slug: `p4-${Date.now()}`, gstEnabled: true, gstin: "27ABCDE1234F1Z0", defaultGstRate: 5, loyaltyEnabled: true, loyaltyEarnPer100: 5, loyaltyPointValue: 1, loyaltyMinRedeem: 10 },
    });
    restaurantId = r.id;
    tableId = (await db.diningTable.create({ data: { restaurantId, name: "T1" } })).id;
    const cat = await db.category.create({ data: { restaurantId, name: "Main" } });
    const item = await db.menuItem.create({
      data: { restaurantId, categoryId: cat.id, name: "Dal", price: 150, variants: { create: [{ name: "Half", price: 150 }, { name: "Full", price: 220 }] } },
      include: { variants: true },
    });
    dal = { id: item.id, half: item.variants.find((v) => v.name === "Half")!.id, full: item.variants.find((v) => v.name === "Full")!.id };
    dalIng = (await db.ingredient.create({ data: { restaurantId, name: "Dal", unit: "kg", currentStock: 10, costPerUnit: 120 } })).id;
    butterIng = (await db.ingredient.create({ data: { restaurantId, name: "Butter", unit: "kg", currentStock: 2, costPerUnit: 500 } })).id;
    await db.recipeLine.createMany({
      data: [
        { menuItemId: dal.id, ingredientId: dalIng, variantId: null, quantity: 0.15 },
        { menuItemId: dal.id, ingredientId: butterIng, variantId: null, quantity: 0.02 },
        { menuItemId: dal.id, ingredientId: dalIng, variantId: dal.full, quantity: 0.25 },
      ],
    });
  });

  afterAll(async () => {
    if (restaurantId) await db.organization.deleteMany({ where: { restaurants: { some: { id: restaurantId } } } });
    await db.$disconnect();
  });

  it("uses stock only when the kitchen gets the order", async () => {
    const { kot } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "QR" },
      lines: [
        { itemId: dal.id, variantId: dal.half, addonIds: [], quantity: 2 },
        { itemId: dal.id, variantId: dal.full, addonIds: [], quantity: 1 },
      ],
      kotStatus: "PENDING_APPROVAL",
      createdById: null,
    });
    expect(await stock(dalIng)).toBe(10);
    await decideKot(restaurantId, kot.id, true);
    // half: 2 x (0.15 dal + 0.02 butter); full: own recipe 0.25 dal only
    expect(await stock(dalIng)).toBeCloseTo(10 - 0.55);
    expect(await stock(butterIng)).toBeCloseTo(2 - 0.04);
    expect(await db.stockMovement.count({ where: { restaurantId, type: "SALE" } })).toBe(2);
  });

  it("returns stock for food cancelled before cooking, not after", async () => {
    const items = await db.orderItem.findMany({ where: { order: { tableId } }, orderBy: { createdAt: "asc" } });
    const full = items.find((i) => i.variantName === "Full")!;
    const half = items.find((i) => i.variantName === "Half")!;
    await cancelItem(restaurantId, full.id, "", "CASHIER");
    expect(await stock(dalIng)).toBeCloseTo(10 - 0.3);
    await db.orderItem.update({ where: { id: half.id }, data: { status: "PREPARING" } });
    await cancelItem(restaurantId, half.id, "Burnt", "MANAGER");
    expect(await stock(dalIng)).toBeCloseTo(10 - 0.3);
  });

  it("redeems points at billing, refunds on reopen and earns on payment", async () => {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "STAFF" },
      lines: [{ itemId: dal.id, variantId: dal.full, addonIds: [], quantity: 2 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    await setOrderCustomer(restaurantId, order.id, "9811111111", "Asha");
    const customer = await db.customer.findUniqueOrThrow({ where: { restaurantId_phone: { restaurantId, phone: "9811111111" } } });
    await expect(redeemPoints(restaurantId, order.id, 20)).rejects.toThrow(/only 0 points/);
    await db.customer.update({ where: { id: customer.id }, data: { points: 100 } });
    await expect(redeemPoints(restaurantId, order.id, 5)).rejects.toThrow(/At least 10/);
    await redeemPoints(restaurantId, order.id, 40);

    const billed = await generateBill(restaurantId, order.id);
    // 440 - 40 points = 400 taxable; +5% = 420
    expect(Number(billed.discountAmount)).toBe(40);
    expect(Number(billed.grandTotal)).toBe(420);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(60);

    await reopenBill(restaurantId, order.id);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(100);
    await generateBill(restaurantId, order.id);
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(60);

    const paid = await recordPayment(restaurantId, order.id, { method: "UPI", amountPaise: 42000 });
    expect(paid.status).toBe("PAID");
    const after = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.points).toBe(60 + 21); // 5 points per ₹100 on ₹420
    expect(after.visits).toBe(1);
    expect(Number(after.totalSpent)).toBe(420);
    const ledger = await db.loyaltyTransaction.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((l) => [l.type, l.points])).toEqual([
      ["REDEEM", -40],
      ["REFUND", 40],
      ["REDEEM", -40],
      ["EARN", 21],
    ]);
  });

  it("creates reservations and limits repeated online requests", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const input = { name: "Ravi", phone: "9822222222", partySize: 4, date: tomorrow, time: "20:00" };
    const staff = await createReservation(restaurantId, { ...input, tableId }, "STAFF");
    expect(staff.status).toBe("CONFIRMED");
    for (let i = 0; i < 3; i++) expect((await createReservation(restaurantId, input, "ONLINE")).status).toBe("REQUESTED");
    await expect(createReservation(restaurantId, input, "ONLINE")).rejects.toThrow(/already have booking requests/);
    await expect(createReservation(restaurantId, { ...input, date: "2020-01-01" }, "STAFF")).rejects.toThrow(/already passed/);
    expect(await db.customer.count({ where: { restaurantId, phone: "9822222222" } })).toBe(1);
  });
});
