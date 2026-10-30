import Link from "next/link";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { appUrl } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { ORDER_ROLES } from "@/server/orders";
import { istDateTime } from "@/server/reservations";
import { AddReservationForm, ReservationRow } from "./controls";

export const metadata = { title: "Reservations" };

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return istDate(d);
}

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(ORDER_ROLES);
  const sp = await searchParams;
  const today = istDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const start = istDateTime(date, "00:00");
  const end = new Date(start.getTime() + 86_400_000);

  const [restaurant, tables, list, requested] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, slug: true, reservationsEnabled: true } }),
    db.diningTable.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, capacity: true } }),
    db.reservation.findMany({ where: { restaurantId, startsAt: { gte: start, lt: end } }, orderBy: { startsAt: "asc" }, include: { table: { select: { name: true } } } }),
    db.reservation.count({ where: { restaurantId, status: "REQUESTED", startsAt: { gte: new Date() } } }),
  ]);
  const guests = list.filter((r) => r.status === "CONFIRMED" || r.status === "SEATED").reduce((s, r) => s + r.partySize, 0);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Reservations"
        description={restaurant.reservationsEnabled ? `Online booking link: ${appUrl(`/m/${restaurant.slug}/book`)}` : "Turn on online booking in Settings to share a booking link."}
      />
      {requested > 0 && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">{requested} online booking request(s) waiting for confirmation.</p>}

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">New booking</h2>
        <AddReservationForm tables={tables} defaultDate={date < today ? today : date} />
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`?date=${shift(date, -1)}`} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-300">
          ←
        </Link>
        <form>
          <input type="date" name="date" defaultValue={date} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" aria-label="Date" />
          <button className="ml-2 h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-300">Go</button>
        </form>
        <Link href={`?date=${shift(date, 1)}`} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-300">
          →
        </Link>
        {date !== today && (
          <Link href="?" className="text-sm text-brand-700 hover:underline">
            Today
          </Link>
        )}
        <span className="ml-auto text-sm text-stone-500">
          {list.length} booking(s) · {guests} guests
        </span>
      </div>

      <Card className="p-0">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">No bookings for this day.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {list.map((r) => (
              <ReservationRow
                key={r.id}
                tables={tables}
                restaurantName={restaurant.name}
                r={{
                  id: r.id,
                  name: r.name,
                  phone: r.phone,
                  partySize: r.partySize,
                  startsAt: r.startsAt.toISOString(),
                  status: r.status,
                  tableId: r.tableId,
                  tableName: r.table?.name ?? null,
                  note: r.note,
                  source: r.source,
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
