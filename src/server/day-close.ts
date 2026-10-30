import "server-only";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { startOfIstDay } from "./stats";

export interface DaySummary {
  date: string;
  cash: number;
  upi: number;
  card: number;
  online: number;
  other: number;
  total: number;
  ordersCount: number;
  runningOrders: number;
  suggestedOpening: number;
}

/** Money actually received during an IST day (by payment time), for cash reconciliation. */
export async function daySummary(restaurantId: string, date: string): Promise<DaySummary> {
  const start = startOfIstDay(new Date(`${date}T12:00:00+05:30`));
  const end = new Date(start.getTime() + 86_400_000);
  const [byMethod, ordersCount, runningOrders, previous] = await Promise.all([
    db.payment.groupBy({ by: ["method"], where: { order: { restaurantId }, createdAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    db.order.count({ where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } } }),
    db.order.count({ where: { restaurantId, status: { in: ["OPEN", "BILLED"] } } }),
    db.dayClose.findFirst({ where: { restaurantId, businessDate: { lt: date } }, orderBy: { businessDate: "desc" } }),
  ]);
  const get = (m: string) => toPaise(byMethod.find((b) => b.method === m)?._sum.amount ?? 0);
  const s = { cash: get("CASH"), upi: get("UPI"), card: get("CARD"), online: get("RAZORPAY"), other: get("OTHER") };
  return {
    date,
    ...s,
    total: s.cash + s.upi + s.card + s.online + s.other,
    ordersCount,
    runningOrders,
    // Whatever was left in the drawer after the last close.
    suggestedOpening: previous ? toPaise(previous.countedCash) - toPaise(previous.cashWithdrawn) : 0,
  };
}
