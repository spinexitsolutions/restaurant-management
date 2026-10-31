import { requireRestaurantSession, MANAGE_ROLES } from "@/lib/auth";
import { describeCoupon } from "@/lib/coupons";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { Badge, Card, PageHeader } from "@/components/ui";
import { toRule } from "@/server/coupons";
import { CouponForm, CouponRowActions } from "./forms";

export const metadata = { title: "Coupons" };

export default async function CouponsPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const [coupons, usage, restaurant] = await Promise.all([
    db.coupon.findMany({ where: { restaurantId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.couponRedemption.groupBy({ by: ["couponId"], where: { coupon: { restaurantId } }, _count: true, _sum: { amount: true } }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { winbackOffer: true, winbackEnabled: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.couponId, { count: u._count, total: toPaise(u._sum.amount ?? 0) }]));
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Coupons" description="Codes like FIRST50 or WEEKEND20. Staff type them on the bill, guests type them on their phone after scanning the QR." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-0">
          {coupons.length === 0 ? (
            <p className="p-6 text-sm text-stone-500">No coupons yet. Create your first one on the right.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {coupons.map((c) => {
                const u = used.get(c.id) ?? { count: 0, total: 0 };
                const expired = c.validTo && c.validTo < now;
                const inWinback = restaurant.winbackOffer.includes(c.code);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-bold tracking-wide">{c.code}</span>
                        {!c.isActive ? <Badge>Off</Badge> : expired ? <Badge tone="amber">Expired</Badge> : <Badge tone="green">Live</Badge>}
                        {c.firstOrderOnly && <Badge tone="brand">First order</Badge>}
                        {inWinback && <Badge tone="brand">In win-back message</Badge>}
                      </p>
                      <p className="text-sm text-stone-600">{c.description || describeCoupon(toRule(c))}</p>
                      <p className="text-xs text-stone-500">
                        Used {u.count}
                        {c.usageLimit ? ` / ${c.usageLimit}` : ""} times · {formatINR(u.total)} given
                        {c.perCustomerLimit ? ` · ${c.perCustomerLimit} per customer` : ""}
                        {c.validTo ? ` · till ${c.validTo.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}` : ""}
                      </p>
                    </div>
                    <CouponRowActions id={c.id} isActive={c.isActive} inWinback={inWinback} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <CouponForm />
          <Card className="text-sm text-stone-600">
            <p className="font-semibold text-stone-800">Win-back message</p>
            <p className="mt-1">
              Guests who haven&apos;t come back get: “…enjoy <b>{restaurant.winbackOffer}</b>”. Tap “Use in win-back” on a coupon to send a real code.
              {!restaurant.winbackEnabled && " (Win-back is off — turn it on in Settings.)"}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
