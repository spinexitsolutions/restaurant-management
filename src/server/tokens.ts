import "server-only";
import { db } from "@/lib/db";
import { READY_SHOWN_MINUTES, tokenState } from "@/lib/tokens";

export interface BoardToken {
  orderId: string;
  token: number;
  label: string | null; // Zomato / Swiggy / customer name
  readyAt: string | null;
  readyItemIds: string[];
}

/** Today's counter tokens split into "preparing" and "ready for pickup". */
export async function tokenBoard(restaurantId: string, now = new Date()) {
  const orders = await db.order.findMany({
    where: { restaurantId, tokenNumber: { not: null }, status: { not: "CANCELLED" }, createdAt: { gte: new Date(now.getTime() - 12 * 3_600_000) } },
    orderBy: { tokenNumber: "asc" },
    select: {
      id: true,
      tokenNumber: true,
      channel: true,
      customerName: true,
      items: { where: { kot: { status: "ACCEPTED" } }, select: { id: true, status: true, held: true, updatedAt: true } },
    },
  });
  const preparing: BoardToken[] = [];
  const ready: BoardToken[] = [];
  const cutoff = now.getTime() - READY_SHOWN_MINUTES * 60_000;
  for (const o of orders) {
    const { state, readyAt } = tokenState(o.items);
    const t: BoardToken = {
      orderId: o.id,
      token: o.tokenNumber!,
      label: o.channel ? (o.channel === "ZOMATO" ? "Zomato" : "Swiggy") : (o.customerName?.split(" ")[0] ?? null), // first name only on a public screen
      readyAt: readyAt?.toISOString() ?? null,
      readyItemIds: o.items.filter((i) => i.status === "READY").map((i) => i.id),
    };
    if (state === "PREPARING") preparing.push(t);
    else if (state === "READY" && readyAt!.getTime() >= cutoff) ready.push(t);
  }
  ready.sort((a, b) => b.readyAt!.localeCompare(a.readyAt!));
  return { preparing, ready };
}

export async function displayRestaurant(key: string) {
  return db.restaurant.findUnique({ where: { displayKey: key }, select: { id: true, name: true, logoUrl: true, menuThemeColor: true, tokenMode: true, isActive: true } });
}
