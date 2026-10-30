import { notFound, redirect } from "next/navigation";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadMenu } from "@/server/menu";
import { getOrderView } from "@/server/order-view";
import { BILLING_ROLES, ORDER_ROLES } from "@/server/orders";
import { OrderWorkspace } from "./order-workspace";

export const metadata = { title: "Order" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ table?: string; type?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const session = await requireRestaurantSession(ORDER_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: session.restaurantId } });

  let order = null;
  let context: { tableId: string | null; tableName: string | null; type: "DINE_IN" | "TAKEAWAY" | "DELIVERY" };
  if (id === "new") {
    if (sp.table) {
      const table = await db.diningTable.findFirst({ where: { id: sp.table, restaurantId: restaurant.id } });
      if (!table) notFound();
      const running = await db.order.findFirst({ where: { tableId: table.id, status: { in: ["OPEN", "BILLED"] } }, select: { id: true } });
      if (running) redirect(`/dashboard/orders/${running.id}`);
      context = { tableId: table.id, tableName: table.name, type: "DINE_IN" };
    } else {
      context = { tableId: null, tableName: null, type: sp.type === "DELIVERY" ? "DELIVERY" : "TAKEAWAY" };
    }
  } else {
    order = await getOrderView(restaurant, id);
    if (!order) notFound();
    context = { tableId: order.tableId, tableName: order.tableName, type: order.type };
  }

  const [tables, running] = await Promise.all([
    db.diningTable.findMany({ where: { restaurantId: restaurant.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
    db.order.findMany({ where: { restaurantId: restaurant.id, status: { in: ["OPEN", "BILLED"] }, tableId: { not: null } }, select: { id: true, tableId: true, orderNumber: true, status: true } }),
  ]);
  const byTable = new Map(running.map((o) => [o.tableId, o]));

  return (
    <OrderWorkspace
      floorTables={tables.map((t) => {
        const o = byTable.get(t.id);
        return { id: t.id, name: t.name, orderId: o?.id ?? null, orderNumber: o?.orderNumber ?? null, orderStatus: o?.status ?? null };
      })}
      order={order}
      context={context}
      menu={await loadMenu(restaurant.id, Number(restaurant.defaultGstRate))}
      canBill={BILLING_ROLES.includes(session.role)}
      restaurant={{
        name: restaurant.name,
        upiId: restaurant.upiId,
        upiPayeeName: restaurant.upiPayeeName,
        acceptCash: restaurant.acceptCash,
        acceptCard: restaurant.acceptCard,
        gstMode: restaurant.gstMode,
      }}
    />
  );
}
