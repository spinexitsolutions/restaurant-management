import { AlertTriangle, Info, Star, TrendingDown, TrendingUp } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { formatINR } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { aiAvailable, loadInsights } from "@/server/insights";
import { AiSummary } from "./ai-summary";

export const metadata = { title: "Insights" };

const TONE = {
  good: { icon: TrendingUp, cls: "bg-green-50 text-green-900 ring-green-200" },
  bad: { icon: TrendingDown, cls: "bg-red-50 text-red-900 ring-red-200" },
  warn: { icon: AlertTriangle, cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  info: { icon: Info, cls: "bg-blue-50 text-blue-900 ring-blue-200" },
};

export default async function InsightsPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const data = await loadInsights(restaurantId);
  const max = Math.max(1, ...data.dailySales.map((d) => d.amount));

  return (
    <div className="max-w-6xl">
      <PageHeader title="Insights" description="What your last 4 weeks of sales and stock say, and what to do about it." />
      {aiAvailable() && <AiSummary />}

      <Card className="mb-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Daily sales, last 28 days</h2>
          <span className="text-sm text-stone-500">
            {formatINR(data.totals.last28)} · {data.totals.bills} bills
          </span>
        </div>
        <div className="flex h-32 items-end gap-1">
          {data.dailySales.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${formatINR(d.amount)} (${d.bills} bills)`}>
              <div className="rounded-t bg-brand-500 group-hover:bg-brand-700" style={{ height: `${Math.max(2, (d.amount / max) * 120)}px` }} />
            </div>
          ))}
        </div>
      </Card>

      {data.insights.length === 0 ? (
        <Card className="mb-6 text-sm text-stone-500">Not enough sales yet. Insights appear after a week or two of billing.</Card>
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {data.insights.map((i) => {
            const t = TONE[i.tone];
            return (
              <div key={i.title} className={cn("flex gap-3 rounded-xl p-4 ring-1", t.cls)}>
                <t.icon size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{i.title}</p>
                  <p className="text-sm opacity-90">{i.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.comments.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">What customers said</h2>
          <ul className="space-y-2 text-sm">
            {data.comments.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className={cn("inline-flex h-fit shrink-0 items-center gap-0.5 rounded px-1.5 text-xs font-semibold text-white", c.rating >= 4 ? "bg-green-700" : c.rating >= 3 ? "bg-amber-500" : "bg-red-600")}>{c.rating} <Star size={10} className="fill-current" /></span>
                <span>
                  <span className="font-medium">{c.menuItem.name}:</span> {c.comment}
                  <span className="block text-xs text-stone-400">{c.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-semibold">Stock for tomorrow</h2>
          <p className="text-sm text-stone-500">Average use on the same weekday over the last 4 weeks, plus a 20% buffer, minus what you have.</p>
        </div>
        {data.forecast.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">Set up recipes in Inventory to get a forecast.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-y border-stone-200 bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-5 py-2 font-medium">Ingredient</th>
                <th className="px-5 py-2 text-right font-medium">Expected use</th>
                <th className="px-5 py-2 text-right font-medium">In stock</th>
                <th className="px-5 py-2 text-right font-medium">Buy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.forecast.map((f) => (
                <tr key={f.name}>
                  <td className="px-5 py-2 font-medium">{f.name}</td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {f.expected} {f.unit}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {Number(f.stock.toFixed(3))} {f.unit}
                  </td>
                  <td className={cn("px-5 py-2 text-right font-semibold tabular-nums", f.toBuy > 0 ? "text-red-700" : "text-green-700")}>
                    {f.toBuy > 0 ? `${f.toBuy} ${f.unit}` : "Enough"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
