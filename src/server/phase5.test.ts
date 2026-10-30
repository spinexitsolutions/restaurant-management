// Integration tests for outlets, subscriptions, aggregator orders and WhatsApp jobs. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { PLANS } from "@/lib/plans";
import { generateBill, placeItems, recordPayment } from "./orders";
import { copyMenu, createOutlet } from "./outlets";
import { applySubscription } from "./subscriptions";
import { notifyBillPaid, runDailyJobs } from "./whatsapp";

describe.skipIf(!process.env.DATABASE_URL)("phase 5", () => {
  let orgId: string;
  let mainId: string;
  let itemId: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ||= "test-key";
    const r = await db.restaurant.create({
      data: {
        organization: { create: { name: "Chain" } },
        name: "Main",
        slug: `p5-${Date.now()}`,
        state: "Maharashtra",
        gstEnabled: true,
        gstin: "27ABCDE1234F1Z5",
        defaultGstRate: 5,
        planExpiresAt: new Date(Date.now() + 5 * 86_400_000),
      },
    });
    mainId = r.id;
    orgId = r.organizationId;
    const cat = await db.category.create({ data: { restaurantId: mainId, name: "Main" } });
    await db.menuItem.create({
      data: {
        restaurantId: mainId,
        categoryId: cat.id,
        name: "Biryani",
        price: 300,
        variants: { create: [{ name: "Half", price: 180 }] },
        addonGroups: { create: [{ name: "Extras", options: { create: [{ name: "Raita", price: 30 }] } }] },
      },
    });
    // Orders below use a dish without sizes; Biryani (with a size and add-on) checks menu copying.
    itemId = (await db.menuItem.create({ data: { restaurantId: mainId, categoryId: cat.id, name: "Thali", price: 300 } })).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("creates an outlet with copied settings and menu, and copies only missing items", async () => {
    const outlet = await createOutlet(mainId, { name: "Branch", city: "Pune", copyMenu: true });
    expect(outlet.organizationId).toBe(orgId);
    expect(outlet.gstin).toBe("27ABCDE1234F1Z5");
    const copied = await db.menuItem.findMany({ where: { restaurantId: outlet.id }, include: { variants: true, addonGroups: { include: { options: true } } } });
    expect(copied).toHaveLength(2);
    const biryani = copied.find((c) => c.name === "Biryani")!;
    expect(biryani.variants[0].name).toBe("Half");
    expect(biryani.addonGroups[0].options[0].name).toBe("Raita");
    expect(await db.diningTable.count({ where: { restaurantId: outlet.id } })).toBe(6);
    expect(await copyMenu(mainId, outlet.id)).toEqual({ categories: 0, items: 0 });
  });

  it("extends the plan from the current expiry and numbers invoices", async () => {
    const plan = PLANS.find((p) => p.code === "MONTHLY")!;
    await db.restaurant.update({ where: { id: mainId }, data: { plan: "BASIC" } });
    const before = (await db.restaurant.findUniqueOrThrow({ where: { id: mainId } })).planExpiresAt!;
    const pay = await applySubscription(mainId, plan, { method: "RAZORPAY", razorpayOrderId: "order_1", razorpayPaymentId: "pay_sub_1" });
    expect(pay.periodStart.getTime()).toBe(before.getTime());
    expect(Number(pay.cgst) + Number(pay.sgst)).toBeCloseTo(179.82);
    expect(Number(pay.total)).toBeCloseTo(1178.82);
    expect(pay.invoiceNumber).toMatch(/^SUB\/\d\d-\d\d\/\d{4}$/);
    const again = await applySubscription(mainId, plan, { method: "RAZORPAY", razorpayOrderId: "order_1", razorpayPaymentId: "pay_sub_1" });
    expect(again.id).toBe(pay.id);
    const after = await db.restaurant.findUniqueOrThrow({ where: { id: mainId } });
    expect(after.planExpiresAt!.getTime()).toBe(pay.periodEnd.getTime());
  });

  it("blocks new orders once the subscription has expired past the grace period", async () => {
    await db.restaurant.update({ where: { id: mainId }, data: { planExpiresAt: new Date(Date.now() - 10 * 86_400_000) } });
    const order = () =>
      placeItems({ restaurantId: mainId, newOrder: { type: "TAKEAWAY", source: "STAFF" }, lines: [{ itemId, variantId: null, addonIds: [], quantity: 1 }], kotStatus: "ACCEPTED", createdById: null });
    await expect(order()).rejects.toThrow(/expired/);
    await db.restaurant.update({ where: { id: mainId }, data: { planExpiresAt: new Date(Date.now() + 30 * 86_400_000) } });
    await expect(order()).resolves.toBeTruthy();
  });

  it("bills Zomato orders without GST and settles them as aggregator payments", async () => {
    const { order } = await placeItems({
      restaurantId: mainId,
      newOrder: { type: "DELIVERY", source: "STAFF", channel: "ZOMATO", channelRef: "ZM123" },
      lines: [{ itemId, variantId: null, addonIds: [], quantity: 2 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    const billed = await generateBill(mainId, order.id);
    expect(billed.channel).toBe("ZOMATO");
    expect(billed.gstEnabled).toBe(false);
    expect(Number(billed.cgst)).toBe(0);
    expect(Number(billed.grandTotal)).toBe(600);
    const paid = await recordPayment(mainId, order.id, { method: "AGGREGATOR", amountPaise: 60000 });
    expect(paid.status).toBe("PAID");
  });

  it("sends WhatsApp bills and birthday wishes once, and closes forgotten shifts", async () => {
    const calls: { url: string; body: { template: { name: string } } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }), { status: 200 });
      }),
    );
    await db.restaurant.update({
      where: { id: mainId },
      data: { waPhoneNumberId: "555", waAccessTokenEnc: encrypt("token"), waBillTemplate: "bill_ready", waBirthdayTemplate: "birthday_offer", whatsappNumber: "9800000000" },
    });

    const { order } = await placeItems({
      restaurantId: mainId,
      newOrder: { type: "TAKEAWAY", source: "STAFF", customerName: "Asha", customerPhone: "9811111111" },
      lines: [{ itemId, variantId: null, addonIds: [], quantity: 1 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    await generateBill(mainId, order.id);
    await recordPayment(mainId, order.id, { method: "CASH", amountPaise: 31500 });
    await notifyBillPaid(order.id);
    await notifyBillPaid(order.id); // checkout + webhook
    expect(calls.filter((c) => c.body.template.name === "bill_ready")).toHaveLength(1);
    expect(calls[0].url).toContain("/555/messages");

    await db.customer.update({ where: { restaurantId_phone: { restaurantId: mainId, phone: "9811111111" } }, data: { birthday: istDate().slice(5) } });
    const user = await db.user.create({ data: { restaurantId: mainId, name: "W", email: `w-${mainId}@t.in`, passwordHash: "x", role: "WAITER" } });
    await db.attendance.create({ data: { restaurantId: mainId, userId: user.id, businessDate: "2026-01-01", clockIn: new Date(Date.now() - 20 * 3_600_000) } });

    const first = await runDailyJobs();
    const second = await runDailyJobs();
    expect(first.wishes).toBe(1);
    expect(second.wishes).toBe(0);
    expect(first.shiftsClosed).toBeGreaterThanOrEqual(1);
    expect(await db.attendance.count({ where: { userId: user.id, clockOut: null } })).toBe(0);
    expect(await db.whatsAppMessage.count({ where: { restaurantId: mainId, status: "SENT" } })).toBe(2);
  });
});
