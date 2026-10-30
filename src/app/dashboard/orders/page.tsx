import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BILLING_ROLES } from "@/server/orders";
import { startOfIstDay } from "@/server/stats";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orders" };

const STATUSES = ["ALL", "OPEN", "BILLED", "PAID", "CANCELLED"] as const;
const TONE = { OPEN: "stone", BILLED: "amber", PAID: "green", CANCELLED: "red" } as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ date?: string; status?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(BILLING_ROLES);
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : istDate();
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? sp.status! : "ALL";
  const from = startOfIstDay(new Date(`${date}T12:00:00+05:30`));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const where: Prisma.OrderWhereInput = {
    restaurantId,
    createdAt: { gte: from, lt: to },
    ...(status !== "ALL" ? { status: status as OrderStatus } : {}),
  };
  const [orders, paid] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, include: { payments: { select: { method: true, amount: true } } }, take: 500 }),
    db.payment.groupBy({ by: ["method"], where: { order: { restaurantId, status: "PAID", paidAt: { gte: from, lt: to } } }, _sum: { amount: true } }),
  ]);
  const totalPaid = paid.reduce((s, p) => s + toPaise(p._sum.amount ?? 0), 0);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Orders" description="All orders for the selected day." />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" name="date" defaultValue={date} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" />
        <input type="hidden" name="status" value={status} />
        <button className="h-10 rounded-lg bg-white px-4 text-sm ring-1 ring-stone-300">Show</button>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/dashboard/orders?date=${date}&status=${s}`}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium", s === status ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200")}
            >
              {s}
            </Link>
          ))}
        </div>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-stone-500">Collected</p>
          <p className="text-lg font-semibold">{formatINR(totalPaid)}</p>
        </Card>
        {paid.map((p) => (
          <Card key={p.method} className="p-4">
            <p className="text-xs text-stone-500">{p.method}</p>
            <p className="text-lg font-semibold">{formatINR(toPaise(p._sum.amount ?? 0))}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Table / type</th>
              <th className="px-4 py-3 font-medium">Bill no.</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                  No orders.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    #{o.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-600">{o.createdAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-3">
                  {o.tableName ? `Table ${o.tableName}` : o.type === "DELIVERY" ? "Delivery" : "Takeaway"}
                  {o.source === "QR" && <span className="ml-1 text-xs text-stone-400">(QR)</span>}
                </td>
                <td className="px-4 py-3">
                  {o.invoiceNumber ? (
                    <Link href={`/dashboard/orders/${o.id}/invoice`} target="_blank" className="hover:underline">
                      {o.invoiceNumber}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600">{[...new Set(o.payments.map((p) => p.method))].join(" + ") || "-"}</td>
                <td className="px-4 py-3 text-right font-medium">{o.grandTotal ? formatINR(toPaise(o.grandTotal)) : "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone={TONE[o.status]}>{o.status}</Badge>
                  {o.cancelReason && <p className="text-xs text-stone-500">{o.cancelReason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
