import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { APP_NAME, appUrl, cn } from "@/lib/utils";
import { ADMIN_FILTERS, adminRestaurants, renewalWhatsApp, type AdminFilter } from "@/server/admin";
import { PlanBadge } from "./plan-badge";

export const metadata = { title: "Admin · Restaurants" };

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "2-digit" });

function ago(d: Date | null) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter: AdminFilter = sp.f && sp.f in ADMIN_FILTERS ? (sp.f as AdminFilter) : "all";
  const q = sp.q ?? "";
  const monthStart = new Date(`${istDate().slice(0, 8)}01T00:00:00+05:30`);
  const [rows, all, revenue, signups, earned, paidOut] = await Promise.all([
    adminRestaurants(filter, q),
    adminRestaurants("all", ""),
    db.subscriptionPayment.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    db.restaurant.count({ where: { createdAt: { gte: monthStart } } }),
    db.resellerCommission.aggregate({ _sum: { amount: true } }),
    db.resellerPayout.aggregate({ _sum: { amount: true } }),
  ]);
  const paying = all.filter((r) => r.plan !== "TRIAL" && r.state !== "EXPIRED").length;
  const trials = all.filter((r) => r.plan === "TRIAL" && r.state !== "EXPIRED").length;
  const due = all.filter((r) => r.isActive && r.state !== "EXPIRED" && r.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
  const billingUrl = appUrl("/dashboard/billing");

  return (
    <div className="space-y-6">
      <PageHeader title="Restaurants" description={`${all.length} outlet(s) on ${APP_NAME}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Paying", String(paying)],
          ["On trial", String(trials)],
          ["Renewal due (7 days)", String(due.length)],
          ["New this month", String(signups)],
          ["Revenue this month (ex-GST)", formatINR(toPaise(revenue._sum.amount ?? 0))],
          ["Partner commission due", formatINR(toPaise(earned._sum.amount ?? 0) - toPaise(paidOut._sum.amount ?? 0))],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      {due.length > 0 && (
        <Card className="p-0">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Call today: renewals due</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {due.slice(0, 15).map((r) => {
              const wa = renewalWhatsApp(r, APP_NAME, billingUrl);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2">
                  <Link href={`/admin/restaurants/${r.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {r.name} <span className="font-normal text-stone-500">· {r.owner?.name} {r.owner?.phone}</span>
                  </Link>
                  <PlanBadge r={r} />
                  <span className="w-28 text-xs text-stone-500">last order {ago(r.lastOrderAt)}</span>
                  {wa && (
                    <a href={wa} target="_blank" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2 py-1 text-xs font-semibold text-white">
                      <MessageCircle size={14} /> Remind
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(ADMIN_FILTERS) as AdminFilter[]).map((f) => (
          <Link
            key={f}
            href={`/admin?f=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn("rounded-full px-3 py-1 text-sm", f === filter ? "bg-stone-900 text-white" : "bg-white ring-1 ring-stone-200 hover:bg-stone-100")}
          >
            {ADMIN_FILTERS[f]}
          </Link>
        ))}
        <form className="relative ml-auto">
          <input type="hidden" name="f" value={filter} />
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
          <input name="q" defaultValue={q} placeholder="Name, city, owner, phone" className="h-9 w-64 rounded-lg border border-stone-300 bg-white pr-3 pl-9 text-sm" />
        </form>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Activity</th>
              <th className="px-4 py-3 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  Nothing here.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={cn("hover:bg-stone-50", !r.isActive && "opacity-60")}>
                <td className="px-4 py-3">
                  <Link href={`/admin/restaurants/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {r.city ?? "-"}
                    {r.outlets > 1 && ` · ${r.orgName} (${r.outlets} outlets)`}
                    {r.deletionScheduledAt && <span className="text-red-600"> · deleting {fmt(r.deletionScheduledAt)}</span>}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {r.owner?.name}
                  <p className="text-xs text-stone-500">{[r.owner?.phone, r.owner?.email].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge r={r} />
                  {r.planExpiresAt && <p className="mt-1 text-xs text-stone-500">till {fmt(r.planExpiresAt)}</p>}
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {r.orders30} orders / 30d
                  <p className="text-xs text-stone-500">last {ago(r.lastOrderAt)}</p>
                </td>
                <td className="px-4 py-3 text-stone-600">{r.reseller ?? "-"}</td>
                <td className="px-4 py-3 text-stone-600">{fmt(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
