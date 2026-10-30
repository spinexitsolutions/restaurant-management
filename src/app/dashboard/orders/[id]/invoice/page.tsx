import { notFound } from "next/navigation";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Invoice } from "@/components/invoice";
import { ORDER_ROLES } from "@/server/orders";
import { PrintButton } from "../../../tables/print/print-button";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRestaurantSession(ORDER_ROLES);
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, restaurantId: session.restaurantId, status: { in: ["BILLED", "PAID"] } },
    include: { items: { orderBy: { createdAt: "asc" } }, payments: true, restaurant: true },
  });
  if (!order) notFound();
  return (
    <div>
      <div className="no-print mb-4 flex justify-center">
        <PrintButton />
      </div>
      <Invoice order={order} restaurant={order.restaurant} />
      <style>{`@media print { @page { size: 80mm auto; margin: 0; } }`}</style>
    </div>
  );
}
