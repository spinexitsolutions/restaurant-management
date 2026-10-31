import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getOnlinePaymentMode } from "@/lib/payments";
import { getPublicOrderView } from "@/server/order-view";
import { OrderTracker } from "./order-tracker";

export const metadata = { title: "Your order", robots: { index: false } };

export default async function TrackOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const found = await getPublicOrderView(token);
  if (!found || found.restaurant.slug !== slug) notFound();
  const { order, restaurant: r } = found;

  const table = order.tableId ? await db.diningTable.findUnique({ where: { id: order.tableId }, select: { qrToken: true } }) : null;
  const mode = getOnlinePaymentMode(r);
  const rated = order.status === "PAID" ? await db.dishRating.findMany({ where: { orderId: order.id }, select: { menuItemId: true } }) : [];

  return (
    <OrderTracker
      order={order}
      restaurant={{ name: r.name, slug: r.slug, themeColor: r.menuThemeColor }}
      menuUrl={table ? `/m/${r.slug}?t=${table.qrToken}` : `/m/${r.slug}`}
      payment={{ mode, upi: mode === "UPI_QR" && r.upiId ? { id: r.upiId, name: r.upiPayeeName || r.name } : null }}
      ratedItemIds={rated.map((x) => x.menuItemId)}
    />
  );
}
