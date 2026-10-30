import "server-only";
import { db } from "@/lib/db";
import { billFor } from "./order-view";

export interface FloorOrder {
  id: string;
  orderNumber: number;
  status: "OPEN" | "BILLED";
  type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  customerName: string | null;
  total: number;
  itemCount: number;
  readyCount: number;
  pendingApproval: number;
  createdAt: string;
}

export interface FloorTable {
  id: string;
  name: string;
  area: string;
  capacity: number;
  order: FloorOrder | null;
  requests: { id: string; type: "CALL_WAITER" | "REQUEST_BILL" | "WATER"; createdAt: string }[];
}

/** Live state of every table plus running takeaway/delivery orders. */
export async function getFloor(restaurantId: string) {
  const [restaurant, tables, orders, requests] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
    db.diningTable.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.order.findMany({
      where: { restaurantId, status: { in: ["OPEN", "BILLED"] } },
      orderBy: { createdAt: "asc" },
      include: { kots: { include: { items: true } }, payments: true },
    }),
    db.serviceRequest.findMany({ where: { restaurantId, resolvedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);

  const summarize = (o: (typeof orders)[number]): FloorOrder => {
    const live = o.kots.filter((k) => k.status === "ACCEPTED").flatMap((k) => k.items).filter((i) => i.status !== "CANCELLED");
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as "OPEN" | "BILLED",
      type: o.type,
      customerName: o.customerName,
      total: billFor({ ...o, kots: o.kots, payments: o.payments }, restaurant).grandTotal,
      itemCount: live.reduce((s, i) => s + i.quantity, 0),
      readyCount: live.filter((i) => i.status === "READY").length,
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
    requests: requests.filter((r) => r.tableId === t.id).map((r) => ({ id: r.id, type: r.type, createdAt: r.createdAt.toISOString() })),
  }));

  return {
    tables: floorTables,
    others: orders.filter((o) => !o.tableId).map(summarize),
  };
}
