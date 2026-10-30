import "server-only";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";

/** Start of today in IST as a Date. */
export function startOfIstDay(at: Date = new Date()): Date {
  return new Date(`${istDate(at)}T00:00:00+05:30`);
}

export async function todayStats(restaurantId: string) {
  const since = startOfIstDay();
  const [paid, running] = await Promise.all([
    db.order.aggregate({ where: { restaurantId, status: "PAID", paidAt: { gte: since } }, _sum: { grandTotal: true }, _count: true }),
    db.order.count({ where: { restaurantId, status: { in: ["OPEN", "BILLED"] } } }),
  ]);
  return { sales: toPaise(paid._sum.grandTotal ?? 0), orders: paid._count, running };
}
