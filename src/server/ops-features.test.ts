// Integration tests for auto sold-out, course firing, auto-confirmed UPI QR and win-back. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import type { ReceiptDoc } from "@/lib/escpos";
import { refreshAvailability } from "./inventory";
import { fireNextCourse, generateBill, placeItems } from "./orders";
import { checkPosQr, createPosQr } from "./upi-qr";
import { runDailyJobs } from "./whatsapp";

const text = (doc: unknown) => (doc as ReceiptDoc).lines.map((l) => ("text" in l ? l.text : "")).join("\n");

describe.skipIf(!process.env.DATABASE_URL)("ops features", () => {
  let orgId: string;
  let restaurantId: string;
  let tikka: string, butterChicken: string, paneer: string, printerId: string;

  const order = (lines: [string, number][], tableId?: string) =>
    placeItems({
      restaurantId,
      newOrder: { type: tableId ? "DINE_IN" : "TAKEAWAY", tableId, source: "STAFF" },
      lines: lines.map(([itemId, quantity]) => ({ itemId, variantId: null, addonIds: [], quantity })),
      kotStatus: "ACCEPTED",
      createdById: null,
    });

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ||= "test-key";
    const r = await db.restaurant.create({
      data: { organization: { create: { name: "OF" } }, name: "OF", slug: `of-${Date.now()}`, gstEnabled: false, courseFiring: true, razorpayKeyId: "rzp_test_x", razorpayKeySecretEnc: encrypt("secret") },
    });
    restaurantId = r.id;
    orgId = r.organizationId;
    const starters = await db.category.create({ data: { restaurantId, name: "Starters", course: 1 } });
    const mains = await db.category.create({ data: { restaurantId, name: "Mains", course: 2 } });
    tikka = (await db.menuItem.create({ data: { restaurantId, categoryId: starters.id, name: "Paneer Tikka", price: 250 } })).id;
    butterChicken = (await db.menuItem.create({ data: { restaurantId, categoryId: mains.id, name: "Butter Chicken", price: 350 } })).id;
    paneer = (await db.ingredient.create({ data: { restaurantId, name: "Paneer", unit: "kg", currentStock: 0.5 } })).id;
    await db.recipeLine.create({ data: { menuItemId: tikka, ingredientId: paneer, quantity: 0.2 } });
    printerId = (await db.printer.create({ data: { restaurantId, name: "Kitchen", connection: "BROWSER" } })).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("marks a dish sold out when the last portion is used, and brings it back after a purchase", async () => {
    await order([[tikka, 2]]); // 0.5 - 0.4 = 0.1 kg left, not enough for 0.2
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: tikka } })).autoSoldOut).toBe(true);
    await expect(order([[tikka, 1]])).rejects.toThrow(/sold out/);

    await db.ingredient.update({ where: { id: paneer }, data: { currentStock: 2 } });
    await db.$transaction((tx) => refreshAvailability(tx, restaurantId, [paneer]));
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: tikka } })).autoSoldOut).toBe(false);

    await db.restaurant.update({ where: { id: restaurantId }, data: { autoSoldOut: false } });
    await db.ingredient.update({ where: { id: paneer }, data: { currentStock: 0 } });
    await db.$transaction((tx) => refreshAvailability(tx, restaurantId));
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: tikka } })).autoSoldOut).toBe(false); // feature off
    await db.ingredient.update({ where: { id: paneer }, data: { currentStock: 10 } });
  });

  it("holds mains until they are fired, and prints them then", async () => {
    await db.printJob.deleteMany({ where: { printerId } });
    const { order: o } = await order([
      [tikka, 1],
      [butterChicken, 1],
    ]);
    const items = await db.orderItem.findMany({ where: { orderId: o.id } });
    expect(items.find((i) => i.name === "Butter Chicken")!.held).toBe(true);
    expect(items.find((i) => i.name === "Paneer Tikka")!.held).toBe(false);
    const first = await db.printJob.findMany({ where: { printerId } });
    expect(first).toHaveLength(1);
    expect(text(first[0].document)).not.toContain("Butter Chicken");

    await expect(generateBill(restaurantId, o.id)).rejects.toThrow(/on hold/);
    expect(await fireNextCourse(restaurantId, o.id)).toEqual({ course: "Mains", count: 1 });
    const fired = await db.printJob.findMany({ where: { printerId }, orderBy: { createdAt: "asc" } });
    expect(fired).toHaveLength(2);
    expect(text(fired[1].document)).toContain("FIRE MAINS");
    expect(text(fired[1].document)).toContain("Butter Chicken");
    expect(text(fired[1].document)).not.toContain("Paneer Tikka");
    await expect(fireNextCourse(restaurantId, o.id)).rejects.toThrow(/Nothing is on hold/);
  });

  it("confirms a POS UPI QR payment by itself, once", async () => {
    const { order: o } = await order([[butterChicken, 1]]);
    await generateBill(restaurantId, o.id);
    let qrPaid = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/payments/qr_codes")) return Response.json({ id: "qr_123", image_url: "https://rzp.io/qr.png", status: "active" });
        if (url.includes("/qr_codes/qr_123/payments")) return Response.json({ items: qrPaid ? [{ id: "pay_qr1", amount: 35000, status: "captured" }] : [] });
        return new Response("not found", { status: 404 });
      }),
    );
    await expect(createPosQr(restaurantId, o.id, 50000)).rejects.toThrow(/up to/);
    const qr = await createPosQr(restaurantId, o.id, 35000);
    expect(qr.imageUrl).toBe("https://rzp.io/qr.png");
    expect(await checkPosQr(restaurantId, qr.requestId)).toEqual({ paid: false, amount: 35000 });

    qrPaid = true;
    expect(await checkPosQr(restaurantId, qr.requestId)).toEqual({ paid: true, amount: 35000 });
    expect(await checkPosQr(restaurantId, qr.requestId)).toEqual({ paid: true, amount: 35000 });
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PAID");
    vi.unstubAllGlobals();
  });

  it("messages lapsed customers once, skipping those who opted out", async () => {
    const sent: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        sent.push(`${body.template.name}:${body.to}`);
        return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
      }),
    );
    await db.restaurant.update({
      where: { id: restaurantId },
      data: { waPhoneNumberId: "555", waAccessTokenEnc: encrypt("t"), winbackEnabled: true, winbackDays: 30, waWinbackTemplate: "we_miss_you" },
    });
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.customer.createMany({
      data: [
        { restaurantId, phone: "9800000001", name: "Lapsed", visits: 3, lastVisitAt: old },
        { restaurantId, phone: "9800000002", name: "Recent", visits: 3, lastVisitAt: new Date() },
        { restaurantId, phone: "9800000003", name: "OptedOut", visits: 3, lastVisitAt: old, marketingOptOut: true },
      ],
    });
    const first = await runDailyJobs();
    const second = await runDailyJobs();
    expect(sent.filter((s) => s.startsWith("we_miss_you"))).toEqual(["we_miss_you:919800000001"]);
    expect(first.winbacks).toBeGreaterThanOrEqual(1);
    expect(second.winbacks).toBe(0);
  });
});
