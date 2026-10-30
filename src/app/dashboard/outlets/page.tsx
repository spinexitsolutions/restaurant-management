import { redirect } from "next/navigation";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { subscriptionStatus } from "@/lib/plans";
import { Badge, Card, PageHeader } from "@/components/ui";
import { outletsFor } from "@/server/outlets";
import { startOfIstDay } from "@/server/stats";
import { AddOutletForm, CopyMenuForm, SwitchButton } from "./forms";

export const metadata = { title: "Outlets" };

export default async function OutletsPage() {
  const s = await requireRestaurantSession(["OWNER"]);
  const outlets = await outletsFor(s.userId);
  if (!outlets.length) redirect("/dashboard");
  const ids = outlets.map((o) => o.id);
  const today = startOfIstDay();
  const monthStart = startOfIstDay(new Date(`${istDate().slice(0, 8)}01T12:00:00+05:30`));

  const [todaySales, monthSales, running] = await Promise.all([
    db.order.groupBy({ by: ["restaurantId"], where: { restaurantId: { in: ids }, status: "PAID", paidAt: { gte: today } }, _sum: { grandTotal: true }, _count: true }),
    db.order.groupBy({ by: ["restaurantId"], where: { restaurantId: { in: ids }, status: "PAID", paidAt: { gte: monthStart } }, _sum: { grandTotal: true }, _count: true }),
    db.order.groupBy({ by: ["restaurantId"], where: { restaurantId: { in: ids }, status: { in: ["OPEN", "BILLED"] } }, _count: true }),
  ]);
  const pick = (rows: { restaurantId: string; _sum?: { grandTotal: unknown }; _count: number }[], id: string) => rows.find((r) => r.restaurantId === id);
  const rows = outlets.map((o) => ({
    ...o,
    today: toPaise((pick(todaySales, o.id)?._sum?.grandTotal as never) ?? 0),
    todayBills: pick(todaySales, o.id)?._count ?? 0,
    month: toPaise((pick(monthSales, o.id)?._sum?.grandTotal as never) ?? 0),
    running: pick(running, o.id)?._count ?? 0,
    sub: subscriptionStatus(o.planExpiresAt),
  }));
  const totalToday = rows.reduce((t, r) => t + r.today, 0);
  const totalMonth = rows.reduce((t, r) => t + r.month, 0);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Outlets" description="All branches of your brand in one place. Switch to an outlet to run it." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-stone-500">Outlets</p>
          <p className="text-xl font-semibold">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-stone-500">Sales today (all)</p>
          <p className="text-xl font-semibold">{formatINR(totalToday)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-stone-500">Sales this month (all)</p>
          <p className="text-xl font-semibold">{formatINR(totalMonth)}</p>
        </Card>
      </div>

      <Card className="mb-6 overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Outlet</th>
              <th className="px-4 py-3 text-right font-medium">Today</th>
              <th className="px-4 py-3 text-right font-medium">This month</th>
              <th className="px-4 py-3 text-right font-medium">Running</th>
              <th className="px-4 py-3 font-medium">Subscription</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.id === s.restaurantId ? "bg-brand-50/50" : ""}>
                <td className="px-4 py-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-stone-500">{r.city ?? "-"}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatINR(r.today)}
                  <span className="block text-xs text-stone-500">{r.todayBills} bills</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(r.month)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.running}</td>
                <td className="px-4 py-3">
                  <Badge tone={r.sub.state === "ACTIVE" ? "green" : r.sub.state === "GRACE" ? "amber" : "red"}>
                    {r.plan === "TRIAL" ? "Trial" : "Paid"} · {r.sub.state === "EXPIRED" ? "expired" : `${r.sub.daysLeft}d left`}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">{r.id === s.restaurantId ? <span className="text-xs text-stone-500">Current</span> : <SwitchButton id={r.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Add outlet</h2>
          <p className="mb-3 text-sm text-stone-500">GST, payment, loyalty and branding settings are copied from this outlet. Each outlet has its own tables, staff, stock and subscription.</p>
          <AddOutletForm />
        </Card>
        {rows.length > 1 && (
          <Card>
            <h2 className="font-semibold">Copy menu</h2>
            <p className="mb-3 text-sm text-stone-500">Adds items the other outlet doesn&apos;t have yet. Existing items and prices are not changed.</p>
            <CopyMenuForm outlets={rows.map((r) => ({ id: r.id, name: r.name }))} current={s.restaurantId} />
          </Card>
        )}
      </div>
    </div>
  );
}
