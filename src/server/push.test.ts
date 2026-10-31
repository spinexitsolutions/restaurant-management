// Integration test for staff push alerts with web-push mocked. Needs DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; payload: { title: string; body?: string; url?: string } }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

import { db } from "@/lib/db";
import { advanceItems, placeItems } from "./orders";
import { notifyItemsReady, notifyQrOrder, notifyServiceRequest } from "./push";

describe.skipIf(!process.env.DATABASE_URL)("staff push alerts", () => {
  let orgId: string, restaurantId: string, tableId: string, dosa: string;
  let ravi: string, meena: string;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    const r = await db.restaurant.create({ data: { organization: { create: { name: "PS" } }, name: "PS", slug: `ps-${Date.now()}` } });
    restaurantId = r.id;
    orgId = r.organizationId;
    tableId = (await db.diningTable.create({ data: { restaurantId, name: "T4", qrToken: `qr-${Date.now()}` } })).id;
    const cat = await db.category.create({ data: { restaurantId, name: "South" } });
    dosa = (await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name: "Masala Dosa", price: 120 } })).id;
    const user = (name: string, role: "WAITER" | "CHEF", language: string) =>
      db.user.create({ data: { name, email: `${name}-${Date.now()}@t.in`, passwordHash: "x", role, language, restaurantId } });
    ravi = (await user("ravi", "WAITER", "hi")).id;
    meena = (await user("meena", "WAITER", "en")).id;
    const chef = (await user("chef", "CHEF", "en")).id;
    await db.pushSubscription.createMany({
      data: [
        { userId: ravi, restaurantId, endpoint: "https://push.example/ravi", p256dh: "k", auth: "a" },
        { userId: meena, restaurantId, endpoint: "https://push.example/meena", p256dh: "k", auth: "a" },
        { userId: meena, restaurantId, endpoint: "https://push.example/meena-gone", p256dh: "k", auth: "a" },
        { userId: chef, restaurantId, endpoint: "https://push.example/chef", p256dh: "k", auth: "a" },
      ],
    });
  });
  beforeEach(() => void (sent.length = 0));
  afterAll(async () => {
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("tells the order's waiter, in their language, when food is ready", async () => {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "STAFF", waiterId: ravi },
      lines: [{ itemId: dosa, variantId: null, addonIds: [], quantity: 2 }],
      kotStatus: "ACCEPTED",
      createdById: ravi,
    });
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    await advanceItems(restaurantId, items.map((i) => i.id), "READY");
    expect(await notifyItemsReady(restaurantId, items.map((i) => i.id))).toBe(1);
    expect(sent).toEqual([
      { endpoint: "https://push.example/ravi", payload: expect.objectContaining({ title: "खाना तैयार · टेबल T4", body: "2× Masala Dosa परोसने के लिए तैयार", url: `/dashboard/orders/${order.id}` }) },
    ]);
  });

  it("alerts all waiters when no one owns the table, and forgets dead devices", async () => {
    await db.order.updateMany({ where: { tableId }, data: { waiterId: null } });
    expect(await notifyServiceRequest(restaurantId, tableId, "WATER")).toBe(2);
    expect(sent.map((s) => s.endpoint).sort()).toEqual(["https://push.example/meena", "https://push.example/ravi"]);
    expect(sent.find((s) => s.endpoint.endsWith("meena"))!.payload).toMatchObject({ title: "Table T4", body: "Needs water" });
    expect(await db.pushSubscription.count({ where: { endpoint: { contains: "gone" } } })).toBe(0);
  });

  it("announces QR orders waiting for approval", async () => {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "DINE_IN", tableId, source: "QR" },
      lines: [{ itemId: dosa, variantId: null, addonIds: [], quantity: 3 }],
      kotStatus: "PENDING_APPROVAL",
      createdById: null,
    });
    expect(await notifyQrOrder(restaurantId, order.id)).toBeGreaterThan(0);
    expect(sent.find((s) => s.endpoint.endsWith("meena"))!.payload).toMatchObject({ title: "New QR order · Table T4", body: "3 item(s) waiting for you to accept" });
  });
});
