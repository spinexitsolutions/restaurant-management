import Link from "next/link";
import { Printer } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { qrDataUrl, tableMenuUrl } from "@/lib/qr";
import { Card, PageHeader } from "@/components/ui";
import { AddTablesForm, TableCard } from "./table-controls";

export const metadata = { title: "Tables & QR" };

export default async function TablesPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { slug: true, tables: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  const tables = await Promise.all(
    restaurant.tables.map(async (t) => {
      const url = tableMenuUrl(restaurant.slug, t.qrToken);
      return { id: t.id, name: t.name, area: t.area ?? "", capacity: t.capacity, url, qr: await qrDataUrl(url, 240) };
    }),
  );

  const areas = [...new Set(tables.map((t) => t.area || "Main"))];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Tables & QR codes"
        description="Each table has its own QR. When a customer scans it, their order is tagged with the table automatically."
        actions={
          tables.length > 0 && (
            <Link
              href="/dashboard/tables/print"
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium hover:bg-stone-50"
            >
              <Printer size={16} /> Print all QR
            </Link>
          )
        }
      />
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Add tables</h2>
        <AddTablesForm />
      </Card>

      {tables.length === 0 ? (
        <Card className="text-center text-sm text-stone-500">No tables yet.</Card>
      ) : (
        areas.map((area) => (
          <section key={area} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{area}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tables
                .filter((t) => (t.area || "Main") === area)
                .map((t) => (
                  <TableCard key={t.id} table={t} />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
