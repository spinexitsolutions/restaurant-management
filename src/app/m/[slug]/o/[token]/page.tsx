import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { buildUpiLink, getOnlinePaymentMode } from "@/lib/payments";
import { qrDataUrl } from "@/lib/qr";
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
  const due = order.bill.grandTotal - order.paid;
  const upiLink =
    order.status === "BILLED" && mode === "UPI_QR" && r.upiId
      ? buildUpiLink({ upiId: r.upiId, payeeName: r.upiPayeeName || r.name, amountPaise: due, note: order.invoiceNumber ?? `Order ${order.orderNumber}` })
      : null;

  return (
    <OrderTracker
      order={order}
      restaurant={{ name: r.name, slug: r.slug, themeColor: r.menuThemeColor }}
      menuUrl={table ? `/m/${r.slug}?t=${table.qrToken}` : `/m/${r.slug}`}
      payment={{ mode, upiLink, upiQr: upiLink ? await qrDataUrl(upiLink, 260) : null }}
    />
  );
}
