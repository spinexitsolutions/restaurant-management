import Link from "next/link";
import { CalendarDays, Cake, CheckCircle2, Circle, ExternalLink, PackageX } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOnlinePaymentMode } from "@/lib/payments";
import { Card, PageHeader } from "@/components/ui";
import { ClockButton } from "@/components/clock-button";
import { daysUntil } from "@/lib/crm";
import { istDate } from "@/lib/numbering";
import { istDateTime } from "@/server/reservations";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requireRestaurantSession();
  const { denied } = await searchParams;
  const [restaurant, itemCount, categoryCount, tableCount, staffCount] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: session.restaurantId } }),
    db.menuItem.count({ where: { restaurantId: session.restaurantId } }),
    db.category.count({ where: { restaurantId: session.restaurantId } }),
    db.diningTable.count({ where: { restaurantId: session.restaurantId } }),
    db.user.count({ where: { restaurantId: session.restaurantId } }),
  ]);

  const paymentMode = getOnlinePaymentMode(restaurant);
  const today = istDate();
  const [ingredients, bookings, dated] = await Promise.all([
    db.ingredient.findMany({ where: { restaurantId: session.restaurantId, isActive: true }, select: { name: true, currentStock: true, lowStockLevel: true } }),
    db.reservation.findMany({
      where: { restaurantId: session.restaurantId, status: { in: ["REQUESTED", "CONFIRMED"] }, startsAt: { gte: istDateTime(today, "00:00"), lt: istDateTime(today, "23:59") } },
      select: { partySize: true, status: true },
    }),
    db.customer.findMany({ where: { restaurantId: session.restaurantId, OR: [{ birthday: { not: null } }, { anniversary: { not: null } }] }, select: { birthday: true, anniversary: true } }),
  ]);
  const lowStock = ingredients.filter((i) => Number(i.currentStock) <= Number(i.lowStockLevel));
  const celebrations = dated.filter((c) => [c.birthday, c.anniversary].some((d) => d && daysUntil(d, today) <= 7)).length;
  const checklist = [
    { done: itemCount > 0, label: "Add your menu items", href: "/dashboard/menu" },
    { done: tableCount > 0, label: "Create tables and print QR codes", href: "/dashboard/tables" },
    { done: !restaurant.gstEnabled || !!restaurant.gstin, label: "Set GST details (or turn GST off)", href: "/dashboard/settings" },
    { done: paymentMode !== "NONE", label: "Set up UPI or Razorpay payments", href: "/dashboard/settings#payments" },
    { done: staffCount > 1, label: "Add staff (waiters, chef, cashier)", href: "/dashboard/staff" },
  ];
  const isManager = session.role === "OWNER" || session.role === "MANAGER";

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Welcome back, ${session.name.split(" ")[0]}`} description="Here's how your restaurant is set up." />
      {denied && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You don&apos;t have access to that page.</p>
      )}

      <Card className="mb-6 py-3">
        <ClockButton userId={session.userId} />
      </Card>

      {(lowStock.length > 0 || bookings.length > 0 || celebrations > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {lowStock.length > 0 && isManager && (
            <Link href="/dashboard/inventory" className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-4 text-sm shadow-card transition-colors hover:border-stone-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><PackageX size={18} /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-stone-900">{lowStock.length} ingredient(s) running low</span>
                <span className="block truncate text-stone-500">{lowStock.map((i) => i.name).join(", ")}</span>
              </span>
            </Link>
          )}
          {bookings.length > 0 && (
            <Link href="/dashboard/reservations" className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-4 text-sm shadow-card transition-colors hover:border-stone-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><CalendarDays size={18} /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-stone-900">{bookings.length} booking(s) today</span>
                <span className="block text-stone-500">
                  {bookings.reduce((s, b) => s + b.partySize, 0)} guests
                  {bookings.some((b) => b.status === "REQUESTED") && " · some need confirming"}
                </span>
              </span>
            </Link>
          )}
          {celebrations > 0 && session.role !== "WAITER" && session.role !== "CHEF" && (
            <Link href="/dashboard/customers" className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-4 text-sm shadow-card transition-colors hover:border-stone-300">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Cake size={18} /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-stone-900">{celebrations} birthday/anniversary this week</span>
                <span className="block text-stone-500">Send them an offer on WhatsApp</span>
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Menu items", itemCount],
          ["Categories", categoryCount],
          ["Tables", tableCount],
          ["Staff", staffCount],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {isManager && (
          <Card>
            <h2 className="mb-3 font-semibold">Setup checklist</h2>
            <ul className="space-y-2">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-stone-50">
                    {c.done ? <CheckCircle2 className="text-green-600" size={18} /> : <Circle className="text-stone-300" size={18} />}
                    <span className={c.done ? "text-stone-500 line-through" : ""}>{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <h2 className="mb-1 font-semibold">Your digital menu</h2>
          <p className="mb-4 text-sm text-stone-500">
            Customers scan a table QR to open it. Share this link on Instagram or Google too.
          </p>
          <Link
            href={`/m/${restaurant.slug}`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            /m/{restaurant.slug} <ExternalLink size={14} />
          </Link>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">GST</dt>
              <dd>{restaurant.gstEnabled ? `${restaurant.defaultGstRate.toString()}% · ${restaurant.gstMode.toLowerCase()}` : "Off"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Online payments</dt>
              <dd>{paymentMode === "RAZORPAY" ? "Razorpay" : paymentMode === "UPI_QR" ? "UPI QR" : "Not set up"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
