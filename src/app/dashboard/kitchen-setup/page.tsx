import Link from "next/link";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AddPrinterForm, AddStationForm, CategoryCourseSelect, CategoryStationSelect, CourseFiringToggle, PrinterActions, StationDelete } from "./forms";

export const metadata = { title: "Kitchen setup" };

export default async function KitchenSetupPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { courseFiring: true } });
  const [stations, categories, printers, pending] = await Promise.all([
    db.kitchenStation.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { categories: true, items: true } } } }),
    db.category.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, stationId: true, course: true, _count: { select: { items: true } } } }),
    db.printer.findMany({ where: { restaurantId }, orderBy: { createdAt: "asc" }, include: { station: { select: { name: true } } } }),
    db.printJob.groupBy({ by: ["printerId", "status"], where: { restaurantId, status: { in: ["PENDING", "FAILED"] } }, _count: true }),
  ]);
  const count = (printerId: string, status: string) => pending.find((p) => p.printerId === printerId && p.status === status)?._count ?? 0;
  const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 60_000;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Kitchen setup" description="Split the kitchen into stations and connect thermal printers for KOTs and bills." />

      <Card>
        <h2 className="font-semibold">Kitchen stations</h2>
        <p className="mb-3 text-sm text-stone-500">
          For example Tandoor, Chinese, Bar. Each station gets its own kitchen screen and printer. Dishes without a station go to the main kitchen.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {stations.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-sm">
              <Link href={`/dashboard/kitchen?station=${s.id}`} className="font-medium hover:underline">
                {s.name}
              </Link>
              <StationDelete id={s.id} name={s.name} />
            </span>
          ))}
          {stations.length === 0 && <span className="text-sm text-stone-400">No stations yet: everything goes to one kitchen.</span>}
        </div>
        <AddStationForm />
      </Card>

      <Card className="p-0">
        <div className="space-y-2 px-5 pt-5 pb-3">
          <h2 className="font-semibold">Courses</h2>
          <p className="text-sm text-stone-500">
            When a ticket has starters and mains together, mains wait until the waiter taps <strong>Fire Mains</strong>, so they arrive hot after the starters. Set
            which course each category is.
          </p>
          <CourseFiringToggle on={restaurant.courseFiring} />
        </div>
        {restaurant.courseFiring && (
          <ul className="divide-y divide-stone-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span>{c.name}</span>
                <CategoryCourseSelect categoryId={c.id} value={c.course} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {stations.length > 0 && (
        <Card className="p-0">
          <div className="px-5 pt-5 pb-3">
            <h2 className="font-semibold">Which station makes what</h2>
            <p className="text-sm text-stone-500">Set it per category here. A single dish can be moved to another station from its edit page.</p>
          </div>
          <ul className="divide-y divide-stone-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                <span>
                  {c.name} <span className="text-stone-400">· {c._count.items} items</span>
                </span>
                <CategoryStationSelect categoryId={c.id} value={c.stationId} stations={stations.map((s) => ({ id: s.id, name: s.name }))} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Printers</h2>
        <p className="mb-4 text-sm text-stone-500">KOTs print automatically when an order reaches the kitchen; bills print when you generate the bill.</p>
        {printers.length > 0 && (
          <ul className="mb-5 divide-y divide-stone-100 rounded-lg ring-1 ring-stone-200">
            {printers.map((p) => (
              <li key={p.id} className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge>{p.paperWidth}mm</Badge>
                  <Badge tone={online(p.lastSeenAt) ? "green" : "stone"}>{online(p.lastSeenAt) ? "Connected" : p.lastSeenAt ? "Offline" : "Never connected"}</Badge>
                  {p.printKot && <Badge tone="brand">KOT{p.station ? `: ${p.station.name}` : ": all items"}</Badge>}
                  {p.printBill && <Badge tone="brand">Bills</Badge>}
                  {count(p.id, "PENDING") > 0 && <Badge tone="amber">{count(p.id, "PENDING")} waiting</Badge>}
                  {count(p.id, "FAILED") > 0 && <Badge tone="red">{count(p.id, "FAILED")} failed</Badge>}
                  <span className="ml-auto">
                    <PrinterActions id={p.id} />
                  </span>
                </div>
                {p.connection === "BROWSER" ? (
                  <p className="text-stone-600">
                    Open the{" "}
                    <Link href={`/dashboard/print-station?printer=${p.id}`} className="font-medium text-brand-700 hover:underline">
                      print station
                    </Link>{" "}
                    on the computer or tablet the printer is connected to (USB, Bluetooth or installed printer) and keep it open.
                  </p>
                ) : (
                  <div className="space-y-1 text-stone-600">
                    <p>
                      Network printer at <code className="rounded bg-stone-100 px-1">{p.address ?? "not set"}</code>. On a PC in the restaurant (Node.js 18+), download{" "}
                      <code className="rounded bg-stone-100 px-1">print-agent/agent.mjs</code> and run:
                    </p>
                    <pre className="overflow-x-auto rounded bg-stone-900 p-2 text-xs text-stone-100">
                      DINEFLOW_URL={appUrl()} PRINTER_TOKEN={p.agentToken} node agent.mjs
                    </pre>
                    <p className="text-xs text-stone-400">Keep this token private: anyone with it can read this printer&apos;s tickets.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <AddPrinterForm stations={stations.map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
    </div>
  );
}
