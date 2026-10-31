import "server-only";
import { db } from "@/lib/db";
import { billFor } from "./order-view";
import { upcomingByTable } from "./reservations";
import { tokenBoard } from "./tokens";

export interface FloorOrder {
  id: string;
  orderNumber: number;
  tokenNumber: number | null;
  status: "OPEN" | "BILLED";
  type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  customerName: string | null;
  tableName: string | null;
  channel: string | null;
  total: number;
  itemCount: number;
  readyCount: number;
  heldCount: number;
  readyToFire: boolean; // earlier courses served or ready while later ones wait
  pendingApproval: number;
  createdAt: string;
}

export interface FloorTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  order: FloorOrder | null;
  reservation: { name: string; partySize: number; startsAt: string } | null;
  requests: { id: string; type: "CALL_WAITER" | "REQUEST_BILL" | "WATER"; createdAt: string }[];
}

/** Live state of every table plus running takeaway/delivery orders. */
export async function getFloor(restaurantId: string) {
  const [restaurant, tables, orders, requests, reserved] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
    db.diningTable.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.order.findMany({
      where: { restaurantId, status: { in: ["OPEN", "BILLED"] } },
      orderBy: { createdAt: "asc" },
      include: { kots: { include: { items: true } }, payments: true },
    }),
    db.serviceRequest.findMany({ where: { restaurantId, resolvedAt: null }, orderBy: { createdAt: "asc" } }),
    upcomingByTable(restaurantId),
  ]);

  const summarize = (o: (typeof orders)[number]): FloorOrder => {
    const live = o.kots.filter((k) => k.status === "ACCEPTED").flatMap((k) => k.items).filter((i) => i.status !== "CANCELLED");
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      tokenNumber: o.tokenNumber,
      status: o.status as "OPEN" | "BILLED",
      type: o.type,
      customerName: o.customerName,
      tableName: o.tableName,
      channel: o.channel,
      total: billFor(o, restaurant).grandTotal,
      itemCount: live.reduce((s, i) => s + i.quantity, 0),
      readyCount: live.filter((i) => i.status === "READY" && !i.held).length,
      heldCount: live.filter((i) => i.held).length,
      readyToFire: live.some((i) => i.held) && live.filter((i) => !i.held).every((i) => i.status === "READY" || i.status === "SERVED"),
      pendingApproval: o.kots.filter((k) => k.status === "PENDING_APPROVAL").length,
      createdAt: o.createdAt.toISOString(),
    };
  };

  const byTable = new Map(orders.filter((o) => o.tableId).map((o) => [o.tableId!, summarize(o)]));
  const floorTables: FloorTable[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    area: t.area ?? "Main",
    capacity: t.capacity,
    order: byTable.get(t.id) ?? null,
    reservation: reserved.get(t.id) ?? null,
    requests: requests.filter((r) => r.tableId === t.id).map((r) => ({ id: r.id, type: r.type, createdAt: r.createdAt.toISOString() })),
  }));

  // Online payments in the last 10 minutes, for the POS soundbox.
  const recentPayments = await db.payment.findMany({
    where: { method: "RAZORPAY", createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, order: { restaurantId } },
    select: { id: true, amount: true },
  });
  const tokens = restaurant.tokenMode ? await tokenBoard(restaurantId) : null;
  return {
    tokens,
    recentPayments: recentPayments.map((p) => ({ id: p.id, amount: Math.round(Number(p.amount) * 100), online: true })),
    tables: floorTables,
    others: orders.filter((o) => !o.tableId).map(summarize),
  };
}
