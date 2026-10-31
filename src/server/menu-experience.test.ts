// Integration tests for menu suggestions, ratings and media. Need DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateDishes } from "@/app/m/actions";
import { loadMenu } from "./menu";
import { generateBill, placeItems, recordPayment } from "./orders";

describe.skipIf(!process.env.DATABASE_URL)("menu experience", () => {
  let orgId: string;
  let restaurantId: string;
  const ids: Record<string, string> = {};

  async function paidOrder(names: string[]) {
    const { order } = await placeItems({
      restaurantId,
      newOrder: { type: "TAKEAWAY", source: "STAFF" },
      lines: names.map((n) => ({ itemId: ids[n], variantId: null, addonIds: [], quantity: 1 })),
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    const billed = await generateBill(restaurantId, order.id);
    await recordPayment(restaurantId, order.id, { method: "CASH", amountPaise: Math.round(Number(billed.grandTotal) * 100) });
    return billed;
  }

  beforeAll(async () => {
    const r = await db.restaurant.create({ data: { organization: { create: { name: "ME" } }, name: "ME", slug: `me-${Date.now()}`, gstEnabled: false } });
    restaurantId = r.id;
    orgId = r.organizationId;
    const cat = await db.category.create({ data: { restaurantId, name: "All" } });
    for (const [name, price] of [["Tikka", 260], ["Naan", 60], ["Lassi", 90], ["Soup", 120]] as const) {
      ids[name] = (await db.menuItem.create({ data: { restaurantId, categoryId: cat.id, name, price } })).id;
    }
    await db.menuItem.update({
      where: { id: ids.Tikka },
      data: { pairsWith: [ids.Lassi], isKidsFriendly: true, media: { create: [{ kind: "IMAGE", url: "/api/images/abc" }, { kind: "VIDEO", url: "https://youtu.be/dQw4w9WgXcQ", sortOrder: 99 }] } },
    });
  });

  afterAll(async () => {
    if (orgId) await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("suggests the owner's pairing first, then dishes that are often ordered together", async () => {
    await paidOrder(["Tikka", "Naan"]);
    await paidOrder(["Tikka", "Naan", "Soup"]);
    await paidOrder(["Naan", "Soup"]);
    const items = (await loadMenu(restaurantId, 5)).flatMap((c) => c.items);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.Tikka.suggestions).toEqual([ids.Lassi, ids.Naan]); // Soup with Tikka only once
    expect(byName.Naan.suggestions).toEqual([ids.Tikka, ids.Soup]);
    expect(byName.Tikka.isKidsFriendly).toBe(true);
    expect(byName.Tikka.media).toEqual([
      { kind: "IMAGE", url: "/api/images/abc" },
      { kind: "VIDEO", url: "https://youtu.be/dQw4w9WgXcQ" },
    ]);
  });

  it("accepts ratings only for dishes on a paid bill, once each, and shows them after 3", async () => {
    const unpaid = await placeItems({
      restaurantId,
      newOrder: { type: "TAKEAWAY", source: "STAFF" },
      lines: [{ itemId: ids.Tikka, variantId: null, addonIds: [], quantity: 1 }],
      kotStatus: "ACCEPTED",
      createdById: null,
    });
    expect(await rateDishes(unpaid.order.publicToken, [{ menuItemId: ids.Tikka, rating: 5 }])).toEqual({ ok: false, error: "You can rate dishes after paying the bill" });

    const orders = [await paidOrder(["Tikka"]), await paidOrder(["Tikka"]), await paidOrder(["Tikka", "Naan"])];
    expect(await rateDishes(orders[0].publicToken, [{ menuItemId: ids.Lassi, rating: 5 }])).toEqual({ ok: false, error: "These dishes aren't on this bill" });
    await rateDishes(orders[0].publicToken, [{ menuItemId: ids.Tikka, rating: 5 }]);
    const again = await rateDishes(orders[0].publicToken, [{ menuItemId: ids.Tikka, rating: 1 }]);
    expect(again).toEqual({ ok: true, data: { saved: 0 } });

    await rateDishes(orders[1].publicToken, [{ menuItemId: ids.Tikka, rating: 4 }]);
    let tikka = (await loadMenu(restaurantId, 5)).flatMap((c) => c.items).find((i) => i.name === "Tikka")!;
    expect(tikka.rating).toBeNull(); // only 2 ratings so far

    await rateDishes(orders[2].publicToken, [
      { menuItemId: ids.Tikka, rating: 4, comment: "Great char" },
      { menuItemId: ids.Naan, rating: 3 },
    ]);
    tikka = (await loadMenu(restaurantId, 5)).flatMap((c) => c.items).find((i) => i.name === "Tikka")!;
    expect(tikka.rating).toEqual({ average: 4.3, count: 3 });
  });
});
