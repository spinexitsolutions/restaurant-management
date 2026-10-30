import { MessageCircle } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { Card, PageHeader } from "@/components/ui";
import { daySummary } from "@/server/day-close";
import { BILLING_ROLES } from "@/server/orders";
import { CloseDayForm } from "./close-form";

export const metadata = { title: "Day close" };

export default async function DayClosePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireRestaurantSession(BILLING_ROLES);
  const sp = await searchParams;
  const today = istDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;
  const [restaurant, summary, closed, history] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: session.restaurantId }, select: { name: true, whatsappNumber: true, phone: true } }),
    daySummary(session.restaurantId, date),
    db.dayClose.findUnique({ where: { restaurantId_businessDate: { restaurantId: session.restaurantId, businessDate: date } } }),
    db.dayClose.findMany({ where: { restaurantId: session.restaurantId }, orderBy: { businessDate: "desc" }, take: 30 }),
  ]);

  const rows: [string, number][] = [
    ["Cash", summary.cash],
    ["UPI (QR)", summary.upi],
    ["Card", summary.card],
    ["Online (Razorpay)", summary.online],
    ["Other", summary.other],
  ];

  const ownerNumber = restaurant.whatsappNumber || restaurant.phone;
  const report = closed
    ? [
        `*${restaurant.name} · Day close ${date}*`,
        `Bills: ${closed.ordersCount}`,
        `Total sales: ${formatINR(toPaise(closed.totalSales))}`,
        `Cash ${formatINR(toPaise(closed.cashSales))} · UPI ${formatINR(toPaise(closed.upiSales))} · Card ${formatINR(toPaise(closed.cardSales))} · Online ${formatINR(toPaise(closed.onlineSales))}`,
        `Expected cash ${formatINR(toPaise(closed.expectedCash))}, counted ${formatINR(toPaise(closed.countedCash))} (${toPaise(closed.difference) >= 0 ? "+" : ""}${formatINR(toPaise(closed.difference))})`,
        closed.note && `Note: ${closed.note}`,
        `Closed by ${closed.closedByName}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div className="max-w-4xl">
      <PageHeader title="Day close" description="Count the cash drawer at the end of the day and record any difference." />
      <form className="mb-6 flex items-center gap-2">
        <input type="date" name="date" max={today} defaultValue={date} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" aria-label="Date" />
        <button className="h-10 rounded-lg bg-white px-4 text-sm ring-1 ring-stone-300">Show</button>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Collections on {date}</h2>
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-stone-600">{label}</dt>
                <dd className="tabular-nums">{formatINR(value)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatINR(summary.total)}</dd>
            </div>
            <div className="flex justify-between text-stone-500">
              <dt>Bills paid</dt>
              <dd>{summary.ordersCount}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          {closed ? (
            <>
              <h2 className="mb-3 font-semibold">Closed by {closed.closedByName}</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Opening cash" value={toPaise(closed.openingCash)} />
                <Row label="+ Cash sales" value={toPaise(closed.cashSales)} />
                <Row label="= Expected in drawer" value={toPaise(closed.expectedCash)} bold />
                <Row label="Counted" value={toPaise(closed.countedCash)} bold />
                <div className={`flex justify-between rounded-lg px-3 py-2 font-semibold ${toPaise(closed.difference) === 0 ? "bg-green-50 text-green-800" : toPaise(closed.difference) < 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                  <dt>{toPaise(closed.difference) < 0 ? "Short" : toPaise(closed.difference) > 0 ? "Excess" : "Matched"}</dt>
                  <dd>{formatINR(Math.abs(toPaise(closed.difference)))}</dd>
                </div>
                <Row label="Taken out of drawer" value={toPaise(closed.cashWithdrawn)} />
                {closed.note && <p className="text-stone-600">Note: {closed.note}</p>}
              </dl>
              {ownerNumber && (
                <a
                  href={`https://wa.me/91${ownerNumber}?text=${encodeURIComponent(report)}`}
                  target="_blank"
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white"
                >
                  <MessageCircle size={16} /> Send summary on WhatsApp
                </a>
              )}
            </>
          ) : (
            <>
              <h2 className="mb-3 font-semibold">Close the day</h2>
              {summary.runningOrders > 0 && date === today && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {summary.runningOrders} order(s) are still running. Their payments will count on the day they are paid.
                </p>
              )}
              <CloseDayForm date={date} cashSales={summary.cash} suggestedOpening={summary.suggestedOpening} />
            </>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Expected cash</th>
                <th className="px-4 py-3 text-right font-medium">Counted</th>
                <th className="px-4 py-3 text-right font-medium">Difference</th>
                <th className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.map((h) => {
                const diff = toPaise(h.difference);
                return (
                  <tr key={h.id}>
                    <td className="px-4 py-3">
                      <a href={`?date=${h.businessDate}`} className="text-brand-700 hover:underline">
                        {h.businessDate}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(toPaise(h.totalSales))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(toPaise(h.expectedCash))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(toPaise(h.countedCash))}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-green-700"}`}>
                      {diff > 0 ? "+" : ""}
                      {formatINR(diff)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{h.closedByName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <dt className={bold ? "" : "text-stone-600"}>{label}</dt>
      <dd className="tabular-nums">{formatINR(value)}</dd>
    </div>
  );
}
