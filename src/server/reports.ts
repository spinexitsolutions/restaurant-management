import "server-only";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import type { ReportOrder } from "@/lib/reports";
import { startOfIstDay } from "./stats";

export interface Range {
  from: string; // IST yyyy-mm-dd, inclusive
  to: string;
  start: Date;
  end: Date; // exclusive
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses ?from&to (IST dates), defaulting to today and capping the span at one year. */
export function parseRange(from?: string, to?: string): Range {
  const today = istDate();
  let f = from && DATE.test(from) ? from : today;
  let t = to && DATE.test(to) ? to : f;
  if (t < f) [f, t] = [t, f];
  const start = startOfIstDay(new Date(`${f}T12:00:00+05:30`));
  let end = new Date(startOfIstDay(new Date(`${t}T12:00:00+05:30`)).getTime() + 86_400_000);
  if (end.getTime() - start.getTime() > 366 * 86_400_000) end = new Date(start.getTime() + 366 * 86_400_000);
  return { from: f, to: t, start, end };
}

/** Paid bills whose invoice was generated within the range. */
export async function loadReportOrders(restaurantId: string, range: Range): Promise<ReportOrder[]> {
  const orders = await db.order.findMany({
    where: { restaurantId, status: "PAID", billedAt: { gte: range.start, lt: range.end } },
    orderBy: { billedAt: "asc" },
    include: { items: { where: { status: { not: "CANCELLED" } } }, payments: true, waiter: { select: { name: true } } },
  });
  const menuIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.menuItemId)).filter((x): x is string => !!x))];
  const menu = await db.menuItem.findMany({ where: { id: { in: menuIds } }, select: { id: true, category: { select: { name: true } } } });
  const categoryOf = new Map(menu.map((m) => [m.id, m.category.name]));

  return orders.map((o) => ({
    id: o.id,
    invoiceNumber: o.invoiceNumber,
    billedAt: o.billedAt!,
    tableName: o.tableName,
    type: o.type,
    waiterName: o.waiter?.name ?? null,
    gstEnabled: o.gstEnabled ?? false,
    gstMode: o.gstMode ?? "EXCLUSIVE",
    serviceChargeRate: Number(o.serviceChargeRate ?? 0),
    discountType: o.discountType,
    discountValue: o.discountValue ? Number(o.discountValue) : null,
    pointsValue: toPaise(o.pointsRedeemValue),
    subtotal: toPaise(o.subtotal ?? 0),
    discount: toPaise(o.discountAmount ?? 0),
    serviceCharge: toPaise(o.serviceCharge ?? 0),
    cgst: toPaise(o.cgst ?? 0),
    sgst: toPaise(o.sgst ?? 0),
    roundOff: toPaise(o.roundOff ?? 0),
    grandTotal: toPaise(o.grandTotal ?? 0),
    items: o.items.map((i) => ({
      name: i.name,
      variantName: i.variantName,
      category: (i.menuItemId && categoryOf.get(i.menuItemId)) || "Other",
      quantity: i.quantity,
      unitPrice: toPaise(i.unitPrice),
      gstRate: Number(i.gstRate),
    })),
    payments: o.payments.map((p) => ({ method: p.method, amount: toPaise(p.amount) })),
  }));
}
