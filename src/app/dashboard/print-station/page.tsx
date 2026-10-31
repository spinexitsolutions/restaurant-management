import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { PrintStation } from "./print-station";

export const metadata = { title: "Print station" };

export default async function PrintStationPage({ searchParams }: { searchParams: Promise<{ printer?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(["OWNER", "MANAGER", "CASHIER", "CHEF"]);
  const { printer } = await searchParams;
  const printers = await db.printer.findMany({
    where: { restaurantId, isActive: true, connection: "BROWSER" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, paperWidth: true },
  });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Print station" description="Keep this page open on the device the printer is connected to. Tickets print as soon as they arrive." />
      {printers.length === 0 ? (
        <Card className="text-sm text-stone-600">Add a USB / Bluetooth printer in Kitchen setup first.</Card>
      ) : (
        <PrintStation printers={printers} initial={printers.find((p) => p.id === printer)?.id ?? printers[0].id} />
      )}
    </div>
  );
}
