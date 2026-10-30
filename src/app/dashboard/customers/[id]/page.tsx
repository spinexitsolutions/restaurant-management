import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BILLING_ROLES } from "@/server/orders";
import { AdjustPointsForm, CustomerForm } from "../forms";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRestaurantSession(BILLING_ROLES);
  const { id } = await params;
  const c = await db.customer.findFirst({
    where: { id, restaurantId: session.restaurantId },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 50, include: { items: { where: { status: { not: "CANCELLED" } }, select: { name: true, quantity: true } } } },
      loyalty: { orderBy: { createdAt: "desc" }, take: 50 },
      restaurant: { select: { loyaltyEnabled: true } },
    },
  });
  if (!c) notFound();

  // Favourite dishes across their orders
  const favourites = new Map<string, number>();
  for (const o of c.orders) if (o.status === "PAID") for (const i of o.items) favourites.set(i.name, (favourites.get(i.name) ?? 0) + i.quantity);
  const top = [...favourites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={c.name || "Guest"}
        description={c.phone}
        actions={
          <a href={`https://wa.me/91${c.phone}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-medium text-white">
            <MessageCircle size={16} /> WhatsApp
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Visits", String(c.visits)],
          ["Total spent", formatINR(toPaise(c.totalSpent))],
          ["Average bill", c.visits ? formatINR(Math.round(toPaise(c.totalSpent) / c.visits)) : "-"],
          ...(c.restaurant.loyaltyEnabled ? [["Points", String(c.points)]] : []),
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Details</h2>
        <CustomerForm customer={c} />
        {top.length > 0 && <p className="mt-4 text-sm text-stone-600">Usually orders: {top.map(([n, q]) => `${n} (${q})`).join(", ")}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Orders</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {c.orders.length === 0 && <li className="px-5 pb-5 text-stone-500">No orders yet.</li>}
            {c.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2">
                <Link href={`/dashboard/orders/${o.id}`} className="min-w-0 hover:underline">
                  <span className="font-medium">{o.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>{" "}
                  <span className="text-stone-500">· {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ").slice(0, 60)}</span>
                </Link>
                <span className="shrink-0">{o.grandTotal ? formatINR(toPaise(o.grandTotal)) : <Badge>{o.status}</Badge>}</span>
              </li>
            ))}
          </ul>
        </Card>
        {c.restaurant.loyaltyEnabled && (
          <Card>
            <h2 className="mb-3 font-semibold">Points history</h2>
            {(session.role === "OWNER" || session.role === "MANAGER") && (
              <div className="mb-4">
                <AdjustPointsForm id={c.id} />
              </div>
            )}
            <ul className="divide-y divide-stone-100 text-sm">
              {c.loyalty.length === 0 && <li className="text-stone-500">No points yet.</li>}
              {c.loyalty.map((l) => (
                <li key={l.id} className="flex justify-between py-2">
                  <span>
                    {l.type === "EARN" ? "Earned" : l.type === "REDEEM" ? "Redeemed" : l.type === "REFUND" ? "Returned (bill reopened)" : `Adjusted: ${l.note}`}
                    <span className="block text-xs text-stone-500">{l.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${l.points < 0 ? "text-red-600" : "text-green-700"}`}>
                    {l.points > 0 ? "+" : ""}
                    {l.points}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
