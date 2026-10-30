import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Invoice } from "@/components/invoice";

export const metadata = { title: "Your bill", robots: { index: false } };

/** Public invoice link shared with the customer on WhatsApp. */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findFirst({
    where: { publicToken: token, status: { in: ["BILLED", "PAID"] } },
    include: { items: { orderBy: { createdAt: "asc" } }, payments: true, restaurant: true },
  });
  if (!order) notFound();
  return (
    <div className="min-h-screen bg-stone-100 py-6">
      <div className="mx-auto max-w-[340px] shadow">
        <Invoice order={order} restaurant={order.restaurant} />
      </div>
    </div>
  );
}
