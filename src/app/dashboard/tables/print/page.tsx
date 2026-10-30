import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { qrDataUrl, tableMenuUrl } from "@/lib/qr";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print table QR codes" };

export default async function PrintTablesPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { name: true, slug: true, tables: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  const cards = await Promise.all(
    restaurant.tables.map(async (t) => ({ id: t.id, name: t.name, qr: await qrDataUrl(tableMenuUrl(restaurant.slug, t.qrToken), 400) })),
  );

  return (
    <div>
      <div className="no-print mb-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-600">Cut along the dashed lines and place one card on each table.</p>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-0 bg-white sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.id} className="flex break-inside-avoid flex-col items-center border border-dashed border-stone-300 p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{restaurant.name}</p>
            <p className="mt-1 text-lg font-bold">Scan to see menu & order</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.qr} alt="" className="my-3 h-44 w-44" />
            <p className="rounded-full bg-stone-900 px-4 py-1 text-sm font-semibold text-white">Table {c.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
