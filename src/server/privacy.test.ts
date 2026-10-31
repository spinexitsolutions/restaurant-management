// Integration tests for data export, customer erasure and account deletion. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCsv, parseMenuSheet } from "@/lib/menu-import";
import { toCsv } from "@/lib/reports";
import { exportRows } from "./data-export";
import { importMenuRows } from "./menu-import";
import { generateBill, placeItems, setOrderBuyer, setOrderCustomer } from "./orders";
import { cancelAccountDeletion, eraseCustomer, purgeDeletedAccounts, scheduleAccountDeletion } from "./privacy";
import { parseRange } from "./reports";

describe.skipIf(!process.env.DATABASE_URL)("data export and privacy", () => {
  let orgId: string, restaurantId: string, otherOrg: string;

  beforeAll(async () => {
    const r = await db.restaurant.create({ data: { organization: { create: { name: "PV" } }, name: "PV", slug: `pv-${Date.now()}`, gstEnabled: false } });
    restaurantId = r.id;
    orgId = r.organizationId;
    otherOrg = (await db.organization.create({ data: { name: "Other", restaurants: { create: { name: "Other", slug: `pv-o-${Date.now()}` } } } })).id;
  });
  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [orgId, otherOrg] } } });
    await db.$disconnect();
  });

  it("imports a menu sheet, adds or updates by name, and exports it back in the same format", async () => {
    const sheet = parseMenuSheet([
      ["Category", "Item", "Price", "Veg/Non-veg", "Variants"],
      ["Starters", "Paneer Tikka", "250", "Veg", ""],
      ["Mains", "Dal Makhani", "", "Veg", "Half: 180 | Full: 300"],
    ]);
    expect(await importMenuRows(restaurantId, sheet.rows, "add")).toEqual({ created: 2, updated: 0, skipped: 0, categories: 2 });

    const changed = parseMenuSheet([
      ["Category", "Item", "Price", "Veg/Non-veg"],
      ["starters", "paneer tikka", "275", "Veg"],
      ["Starters", "Hara Kebab", "220", "Veg"],
    ]);
    expect(await importMenuRows(restaurantId, changed.rows, "add")).toEqual({ created: 1, updated: 0, skipped: 1, categories: 0 });
    expect(await importMenuRows(restaurantId, changed.rows, "update")).toEqual({ created: 0, updated: 2, skipped: 0, categories: 0 });
    expect(Number((await db.menuItem.findFirstOrThrow({ where: { restaurantId, name: "Paneer Tikka" } })).price)).toBe(275);

    const csv = toCsv(await exportRows(restaurantId, "menu", parseRange()));
    const back = parseMenuSheet(parseCsv(csv));
    expect(back.errors).toEqual([]);
    expect(back.rows.map((r) => `${r.category}/${r.name}/${r.price}`)).toEqual(["Starters/Paneer Tikka/275", "Starters/Hara Kebab/220", "Mains/Dal Makhani/180"]);
    expect(back.rows[2].variants).toEqual([{ name: "Half", price: 180 }, { name: "Full", price: 300 }]);
  });

  it("erases a guest from bills and bookings but keeps the B2B invoice details", async () => {
    const item = await db.menuItem.findFirstOrThrow({ where: { restaurantId, name: "Paneer Tikka" } });
    const place = () => placeItems({ restaurantId, newOrder: { type: "TAKEAWAY", source: "STAFF" }, lines: [{ itemId: item.id, variantId: null, addonIds: [], quantity: 1 }], kotStatus: "ACCEPTED", createdById: null });
    const a = (await place()).order;
    await setOrderCustomer(restaurantId, a.id, "9876511111", "Ravi Kumar");
    await generateBill(restaurantId, a.id);
    const b = (await place()).order;
    await setOrderCustomer(restaurantId, b.id, "9876511111", "Ravi Kumar");
    await setOrderBuyer(restaurantId, b.id, { gstin: "27AAPFU0939F1ZV", name: "Ravi Traders", address: "Pune" });
    const customer = await db.customer.findFirstOrThrow({ where: { restaurantId, phone: "9876511111" } });
    await db.reservation.create({ data: { restaurantId, customerId: customer.id, name: "Ravi", phone: "9876511111", partySize: 2, startsAt: new Date() } });

    const exported = await exportRows(restaurantId, "orders", parseRange());
    expect(exported.some((r) => r.includes("9876511111"))).toBe(true);

    expect(await eraseCustomer(restaurantId, customer.id)).toEqual({ orders: 2, phoneEnd: "1111" });
    expect(await db.customer.count({ where: { restaurantId, phone: "9876511111" } })).toBe(0);
    const orders = await db.order.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(orders.every((o) => !o.customerPhone && !o.customerName && !o.customerId)).toBe(true);
    expect(orders.find((o) => o.id === b.id)!.buyerGstin).toBe("27AAPFU0939F1ZV");
    expect(await db.reservation.findFirstOrThrow({ where: { restaurantId } })).toMatchObject({ name: "Deleted guest", phone: "" });
    expect(await eraseCustomer(restaurantId, customer.id)).toBeNull();
  });

  it("deletes the whole account only after the grace period, and never someone else's", async () => {
    const at = await scheduleAccountDeletion(orgId, new Date("2026-01-01T00:00:00Z"));
    expect(at.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    await cancelAccountDeletion(orgId);
    expect(await purgeDeletedAccounts(new Date("2026-03-01T00:00:00Z"))).toBe(0);

    await scheduleAccountDeletion(orgId, new Date("2026-01-01T00:00:00Z"));
    expect(await purgeDeletedAccounts(new Date("2026-01-15T00:00:00Z"))).toBe(0);
    expect(await purgeDeletedAccounts(new Date("2026-02-01T00:00:00Z"))).toBe(1);
    expect(await db.restaurant.count({ where: { id: restaurantId } })).toBe(0);
    expect(await db.order.count({ where: { restaurantId } })).toBe(0);
    expect(await db.organization.count({ where: { id: otherOrg } })).toBe(1);
  });
});
