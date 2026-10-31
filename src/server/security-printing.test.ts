// Integration tests for kitchen stations, print queue, B2B buyers and one-time codes. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { ReceiptDoc } from "@/lib/escpos";
import { gstinCheckChar } from "@/lib/gstin";
import { cancelItem, generateBill, placeItems, setOrderBuyer } from "./orders";
import { consumeOtp, findAccount, issueOtp } from "./otp";
import { finishJob } from "./printing";

const text = (doc: unknown) => (doc as ReceiptDoc).lines.map((l) => ("text" in l ? l.text : "left" in l ? l.left : "")).join("\n");

describe.skipIf(!process.env.DATABASE_URL)("stations, printing, B2B and OTP", () => {
  let orgId: string;
  let restaurantId: string;
  let naan: string, chai: string;
  let tandoorPrinter: string, mainPrinter: string, billPrinter: string;

  beforeAll(async () => {
    const r = await db.restaurant.create({
      data: { organization: { create: { name: "SP" } }, name: "SP", slug: `sp-${Date.now()}`, gstEnabled: true, gstin: "27AAPFU0939F1ZV", defaultGstRate: 5, state: "Maharashtra" },
    });
    restaurantId = r.id;
    orgId = r.organizationId;
    const tandoor = await db.kitchenStation.create({ data: { restaurantId, name: "Tandoor" } });
    const breads = await db.category.create({ data: { restaurantId, name: "Breads", stationId: tandoor.id } });
    const drinks = await db.category.create({ data: { restaurantId, name: "Drinks" } });
    naan = (await db.menuItem.create({ data: { restaurantId, categoryId: breads.id, name: "Butter Naan", price: 60 } })).id;
    chai = (await db.menuItem.create({ data: { restaurantId, categoryId: drinks.id, name: "Masala Chai", price: 40 } })).id;
    tandoorPrinter = (await db.printer.create({ data: { restaurantId, name: "Tandoor", connection: "AGENT", stationId: tandoor.id } })).id;
    mainPrinter = (await db.printer.create({ data: { restaurantId, name: "Main", connection: "BROWSER" } })).id;
    billPrinter = (await db.printer.create({ data: { restaurantId, name: "Counter", connection: "BROWSER", printKot: false, printBill: true, paperWidth: 58 } })).id;
  });

  afterAll(async () => {
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("sends each station only its own items, and the all-items printer everything", async () => {
    const { order, kot } = await placeItems({
      restaurantId,
      newOrder: { type: "TAKEAWAY", source: "STAFF" },
      lines: [
        { itemId: naan, variantId: null, addonIds: [], quantity: 2 },
        { itemId: chai, variantId: null, addonIds: [], quantity: 1 },
      ],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    const items = await db.orderItem.findMany({ where: { kotId: kot.id } });
    expect(items.find((i) => i.name === "Butter Naan")!.stationId).not.toBeNull();
    expect(items.find((i) => i.name === "Masala Chai")!.stationId).toBeNull();

    const tandoorJob = await db.printJob.findFirstOrThrow({ where: { printerId: tandoorPrinter } });
    expect(text(tandoorJob.document)).toContain("2 x Butter Naan");
    expect(text(tandoorJob.document)).not.toContain("Chai");
    const mainJob = await db.printJob.findFirstOrThrow({ where: { printerId: mainPrinter } });
    expect(text(mainJob.document)).toContain("Masala Chai");
    expect(await db.printJob.count({ where: { printerId: billPrinter } })).toBe(0);

    // Cancelling an item prints a cancellation slip on its station's printer.
    await cancelItem(restaurantId, items.find((i) => i.name === "Butter Naan")!.id, "", "CASHIER");
    const slips = await db.printJob.findMany({ where: { printerId: tandoorPrinter }, orderBy: { createdAt: "asc" } });
    expect(slips).toHaveLength(2);
    expect(text(slips[1].document)).toContain("CANCELLED");

    // B2B: a wrong check digit is rejected, a valid GSTIN lands on the bill.
    await expect(setOrderBuyer(restaurantId, order.id, { gstin: "29AAACB1234C1ZA", name: "Acme Pvt Ltd", address: "" })).rejects.toThrow(/check digit/);
    const gstin = "29AAACB1234C1Z" + gstinCheckChar("29AAACB1234C1Z");
    await setOrderBuyer(restaurantId, order.id, { gstin, name: "Acme Pvt Ltd", address: "Bengaluru" });
    await generateBill(restaurantId, order.id);
    const bill = await db.printJob.findFirstOrThrow({ where: { printerId: billPrinter } });
    expect(text(bill.document)).toContain(`GSTIN: ${gstin}`);
    expect(text(bill.document)).toContain("Billed to: Acme Pvt Ltd");
    // Line amounts are in rupees: 1 chai at ₹40 (the naan was cancelled).
    const chaiLine = (bill.document as unknown as ReceiptDoc).lines.find((l) => l.t === "row" && l.left.includes("Masala Chai"));
    expect(chaiLine && "right" in chaiLine && chaiLine.right).toBe("40.00");
  });

  it("retries a failing job and gives up after 5 attempts", async () => {
    const job = await db.printJob.findFirstOrThrow({ where: { printerId: mainPrinter } });
    for (let i = 0; i < 4; i++) await finishJob(job.id, { restaurantId }, false, "paper out");
    expect((await db.printJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PENDING");
    await finishJob(job.id, { restaurantId }, false, "paper out");
    expect((await db.printJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
  });

  it("issues one-time codes that work once and lock after 5 wrong tries", async () => {
    const user = await db.user.create({ data: { restaurantId, name: "Asha", email: `asha-${restaurantId}@t.in`, phone: "9833333333", passwordHash: "x", role: "CASHIER" } });
    expect((await findAccount("9833333333"))?.id).toBe(user.id);
    expect((await findAccount(`ASHA-${restaurantId}@t.in`))?.id).toBe(user.id);

    // Capture the dev-mode code from the log.
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => void logs.push(a.join(" "));
    await issueOtp(user, "RESET", false);
    console.log = orig;
    const code = logs.join("\n").match(/(\d{6})$/m)![1];

    expect(await consumeOtp(user, "LOGIN", code)).toBe(false); // wrong purpose
    expect(await consumeOtp(user, "RESET", code)).toBe(true);
    expect(await consumeOtp(user, "RESET", code)).toBe(false); // used

    console.log = () => {};
    await issueOtp(user, "RESET", false);
    for (let i = 0; i < 5; i++) await consumeOtp(user, "RESET", "000000");
    const latest = await db.otpCode.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(latest.attempts).toBe(5);
    await issueOtp(user, "RESET", false);
    await expect(issueOtp(user, "RESET", false)).rejects.toThrow(/Too many codes/);
    console.log = orig;
  });
});
