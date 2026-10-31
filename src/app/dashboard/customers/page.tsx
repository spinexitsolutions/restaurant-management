import Link from "next/link";
import { Cake, Heart, MessageCircle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireRestaurantSession } from "@/lib/auth";
import { daysUntil, fillTemplate, formatMonthDay } from "@/lib/crm";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { Card, PageHeader } from "@/components/ui";
import { BILLING_ROLES } from "@/server/orders";
import { CustomerForm, WinbackSendButton } from "./forms";
import { winbackReturned } from "@/lib/winback";
import { winbackCandidates } from "@/server/whatsapp";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(BILLING_ROLES);
  const q = (await searchParams).q?.trim() ?? "";
  const where: Prisma.CustomerWhereInput = {
    restaurantId,
    ...(q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [restaurant, customers, total, withDates] = await Promise.all([
    db.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { id: true, name: true, birthdayOfferText: true, loyaltyEnabled: true, winbackEnabled: true, winbackDays: true, winbackOffer: true, waWinbackTemplate: true, waPhoneNumberId: true },
    }),
    db.customer.findMany({ where, orderBy: [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 200 }),
    db.customer.count({ where: { restaurantId } }),
    db.customer.findMany({ where: { restaurantId, OR: [{ birthday: { not: null } }, { anniversary: { not: null } }] }, select: { id: true, name: true, phone: true, birthday: true, anniversary: true } }),
  ]);

  const today = istDate();
  const [lapsed, campaign] = await Promise.all([
    winbackCandidates(restaurant, new Date(), 30),
    db.customer.findMany({ where: { restaurantId, lastWinbackAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, select: { lastVisitAt: true, lastWinbackAt: true } }),
  ]);
  const winback = winbackReturned(campaign);
  const automatic = restaurant.winbackEnabled && !!restaurant.waWinbackTemplate && !!restaurant.waPhoneNumberId;
  const winbackText = (name: string | null) =>
    `Hi ${name || "there"}, we miss you at ${restaurant.name}! Come back this week and enjoy ${restaurant.winbackOffer}. See you soon 🙏`;
  const upcoming = withDates
    .flatMap((c) =>
      (
        [
          ["Birthday", c.birthday],
          ["Anniversary", c.anniversary],
        ] as const
      )
        .filter(([, d]) => d)
        .map(([kind, d]) => ({ ...c, kind, date: d!, inDays: daysUntil(d!, today) })),
    )
    .filter((u) => u.inDays <= 7)
    .sort((a, b) => a.inDays - b.inDays);

  const message = (name: string | null, kind: string) =>
    fillTemplate(kind === "Birthday" ? restaurant.birthdayOfferText : restaurant.birthdayOfferText.replace(/birthday/gi, "anniversary"), {
      name: name || "there",
      restaurant: restaurant.name,
    });

  return (
    <div className="max-w-6xl">
      <PageHeader title="Customers" description={`${total} customer${total === 1 ? "" : "s"}. Added automatically when a bill has a mobile number.`} />

      {upcoming.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">Coming up in the next 7 days</h2>
          <ul className="divide-y divide-stone-100">
            {upcoming.map((u) => (
              <li key={`${u.id}-${u.kind}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                {u.kind === "Birthday" ? <Cake size={18} className="text-pink-600" /> : <Heart size={18} className="text-red-600" />}
                <span className="flex-1">
                  <Link href={`/dashboard/customers/${u.id}`} className="font-medium hover:underline">
                    {u.name || u.phone}
                  </Link>{" "}
                  · {u.kind} on {formatMonthDay(u.date)}{" "}
                  <span className="text-stone-500">({u.inDays === 0 ? "today" : u.inDays === 1 ? "tomorrow" : `in ${u.inDays} days`})</span>
                </span>
                <a
                  href={`https://wa.me/91${u.phone}?text=${encodeURIComponent(message(u.name, u.kind))}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <MessageCircle size={14} /> Send offer
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">We miss you ({restaurant.winbackDays}+ days away)</h2>
          <p className="text-sm text-stone-500">
            Last 90 days: {winback.sent} messaged · <span className="font-semibold text-green-700">{winback.returned} came back</span>
            {winback.sent > 0 && ` (${Math.round((winback.returned / winback.sent) * 100)}%)`}
          </p>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          {automatic
            ? `Sent automatically every morning on WhatsApp with “${restaurant.winbackOffer}”.`
            : "Turn on automatic messages in Settings → Customers, or send them yourself below."}
        </p>
        {lapsed.length === 0 ? (
          <p className="text-sm text-stone-400">No one to message right now.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lapsed.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:underline">
                    {c.name || c.phone}
                  </Link>
                  <span className="text-stone-500">
                    {" "}
                    · {c.visits} visit{c.visits === 1 ? "" : "s"} · last {c.lastVisitAt!.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                  </span>
                </span>
                {!automatic && <WinbackSendButton id={c.id} href={`https://wa.me/91${c.phone}?text=${encodeURIComponent(winbackText(c.name))}`} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Add customer</h2>
        <CustomerForm />
      </Card>

      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or mobile" className="h-10 w-72 max-w-full rounded-lg border border-stone-300 bg-white px-3 text-sm" />
        <button className="h-10 rounded-lg bg-white px-4 text-sm ring-1 ring-stone-300">Search</button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Visits</th>
              <th className="px-4 py-3 text-right font-medium">Total spent</th>
              {restaurant.loyaltyEnabled && <th className="px-4 py-3 text-right font-medium">Points</th>}
              <th className="px-4 py-3 font-medium">Last visit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                  {q ? "No match." : "No customers yet. Add a mobile number when billing."}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.name || "Guest"}
                  </Link>
                  <p className="text-xs text-stone-500">{c.phone}</p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.visits}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(toPaise(c.totalSpent))}</td>
                {restaurant.loyaltyEnabled && <td className="px-4 py-3 text-right tabular-nums">{c.points}</td>}
                <td className="px-4 py-3 text-stone-600">{c.lastVisitAt ? c.lastVisitAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
