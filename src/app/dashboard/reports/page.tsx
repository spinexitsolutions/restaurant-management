import Link from "next/link";
import { Download } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { buildSalesReport } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { loadReportOrders, parseRange } from "@/server/reports";

export const metadata = { title: "Reports" };

const ACTION_LABEL: Record<string, string> = {
  DISCOUNT_APPLIED: "Discount given",
  DISCOUNT_REMOVED: "Discount removed",
  ITEM_CANCELLED: "Item cancelled",
  ORDER_CANCELLED: "Order cancelled",
  BILL_REOPENED: "Bill reopened",
  KOT_REJECTED: "QR order rejected",
  TABLE_TRANSFERRED: "Table moved",
  ORDERS_MERGED: "Tables merged",
  BILL_SPLIT: "Bill split",
  DAY_CLOSED: "Day closed",
};

function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return istDate(d);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tab?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  const tab = sp.tab === "audit" ? "audit" : "sales";
  const today = istDate();
  const presets = [
    ["Today", today, today],
    ["Yesterday", shiftDays(today, -1), shiftDays(today, -1)],
    ["Last 7 days", shiftDays(today, -6), today],
    ["This month", `${today.slice(0, 8)}01`, today],
  ] as const;

  const [orders, cancelled, logs] = await Promise.all([
    tab === "sales" ? loadReportOrders(restaurantId, range) : Promise.resolve([]),
    db.order.count({ where: { restaurantId, status: "CANCELLED", createdAt: { gte: range.start, lt: range.end } } }),
    tab === "audit"
      ? db.auditLog.findMany({ where: { restaurantId, createdAt: { gte: range.start, lt: range.end } }, orderBy: { createdAt: "desc" }, take: 500 })
      : Promise.resolve([]),
  ]);
  const r = buildSalesReport(orders);
  const q = (extra: Record<string, string>) => new URLSearchParams({ from: range.from, to: range.to, tab, ...extra }).toString();
  const maxHour = Math.max(1, ...r.hours.map((h) => h.amount));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Reports"
        description="Paid bills, by the date the bill was generated (IST)."
        actions={
          <a
            href={`/api/reports/sales?from=${range.from}&to=${range.to}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50"
          >
            <Download size={16} /> Sales register (CSV)
          </a>
        }
      />

      <form className="mb-6 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input type="date" name="from" defaultValue={range.from} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" aria-label="From" />
        <span className="text-sm text-stone-500">to</span>
        <input type="date" name="to" defaultValue={range.to} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" aria-label="To" />
        <button className="h-10 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white">Show</button>
        {presets.map(([label, f, t]) => (
          <Link key={label} href={`?${new URLSearchParams({ from: f, to: t, tab })}`} className={cn("rounded-full px-3 py-1.5 text-xs font-medium ring-1", range.from === f && range.to === t ? "bg-brand-50 text-brand-700 ring-brand-500" : "bg-white ring-stone-200")}>
            {label}
          </Link>
        ))}
      </form>

      <div className="mb-6 flex gap-1 border-b border-stone-200">
        {(["sales", "audit"] as const).map((t) => (
          <Link key={t} href={`?${q({ tab: t })}`} className={cn("px-4 py-2 text-sm font-medium", tab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-stone-500")}>
            {t === "sales" ? "Sales" : "Audit log"}
          </Link>
        ))}
      </div>

      {tab === "audit" ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium">Approved by</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                    Nothing recorded in this period.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">{l.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium">{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="px-4 py-3">
                    {l.orderId ? (
                      <Link href={`/dashboard/orders/${l.orderId}`} className="text-brand-700 hover:underline">
                        #{l.orderNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">{l.userName ?? "-"}</td>
                  <td className="px-4 py-3">{l.approvedBy ?? "-"}</td>
                  <td className="max-w-xs px-4 py-3 text-xs text-stone-600">
                    {Object.entries(l.details as Record<string, unknown>)
                      .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Net sales", formatINR(r.total)],
              ["Bills", String(r.bills)],
              ["Average bill", formatINR(r.averageBill)],
              ["Discounts", formatINR(r.discount)],
              ["GST collected", formatINR(r.cgst + r.sgst)],
              ["Service charge", formatINR(r.serviceCharge)],
              ["Cancelled orders", String(cancelled)],
              ["Items sold", String(r.items.reduce((s, i) => s + i.quantity, 0))],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Payment methods</h2>
              <Table
                head={["Method", "Payments", "Amount"]}
                rows={r.payments.map((p) => [p.method, String(p.count), formatINR(p.amount)])}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">GST summary</h2>
              <Table
                head={["Rate", "Taxable value", "CGST", "SGST"]}
                rows={r.gstSlabs.map((s) => [`${s.gstRate}%`, formatINR(s.taxableValue), formatINR(s.cgst), formatINR(s.sgst)])}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Sales by hour</h2>
              {r.hours.length === 0 ? (
                <p className="text-sm text-stone-500">No sales.</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.hours.map((h) => (
                    <li key={h.hour} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 text-stone-500">{`${h.hour % 12 || 12} ${h.hour < 12 ? "AM" : "PM"}`}</span>
                      <span className="h-5 rounded bg-brand-500" style={{ width: `${Math.max(2, (h.amount / maxHour) * 70)}%` }} />
                      <span className="shrink-0 tabular-nums">{formatINR(h.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Categories</h2>
              <Table head={["Category", "Qty", "Amount"]} rows={r.categories.map((c) => [c.category, String(c.quantity), formatINR(c.amount)])} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Items (best sellers first)</h2>
              <Table head={["Item", "Qty", "Amount"]} rows={r.items.map((i) => [i.name, String(i.quantity), formatINR(i.amount)])} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Staff</h2>
              <Table head={["Taken by", "Bills", "Amount"]} rows={r.staff.map((s) => [s.name, String(s.bills), formatINR(s.amount)])} />
            </Card>
          </div>
          <p className="mt-4 text-xs text-stone-500">Item and category amounts are menu prices before bill discounts.</p>
        </>
      )}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">No data.</p>;
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-stone-500">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("pb-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, i) => (
                <td key={i} className={cn("py-1.5", i > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
