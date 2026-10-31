import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { subscriptionStatus } from "@/lib/plans";

type Tx = Prisma.TransactionClient;

/** Partner's share of a subscription payment (on the price before GST), recorded once per payment. */
export async function recordCommission(tx: Tx, paymentId: string, restaurantId: string, amountPaise: number) {
  if (amountPaise <= 0) return null;
  const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { organization: { select: { reseller: true } } } });
  const reseller = r.organization.reseller;
  if (!reseller || !reseller.isActive) return null;
  const amount = Math.round((amountPaise * Number(reseller.commissionRate)) / 100);
  return tx.resellerCommission.upsert({
    where: { subscriptionPaymentId: paymentId },
    update: {},
    create: { resellerId: reseller.id, subscriptionPaymentId: paymentId, rate: reseller.commissionRate, amount: amount / 100 },
  });
}

/** Earned, paid and due amounts (paise) plus the partner's restaurants. */
export async function resellerSummary(resellerId: string) {
  const [earned, paid, orgs] = await Promise.all([
    db.resellerCommission.aggregate({ where: { resellerId }, _sum: { amount: true } }),
    db.resellerPayout.aggregate({ where: { resellerId }, _sum: { amount: true } }),
    db.organization.findMany({
      where: { resellerId },
      include: { restaurants: { select: { id: true, name: true, city: true, plan: true, planExpiresAt: true, isActive: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const restaurants = orgs.flatMap((o) => o.restaurants);
  const paying = restaurants.filter((r) => r.plan !== "TRIAL" && subscriptionStatus(r.planExpiresAt).state !== "EXPIRED").length;
  const earnedPaise = toPaise(earned._sum.amount ?? 0);
  const paidPaise = toPaise(paid._sum.amount ?? 0);
  return { earned: earnedPaise, paid: paidPaise, due: earnedPaise - paidPaise, restaurants, paying };
}

/** Short shareable referral code from the partner's name, e.g. "RAVI42". */
export async function uniqueResellerCode(name: string) {
  const base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "PARTNER";
  for (let i = 0; i < 50; i++) {
    const code = `${base}${Math.floor(10 + Math.random() * 90)}`;
    if (!(await db.reseller.findUnique({ where: { code } }))) return code;
  }
  throw new Error("Could not create a referral code");
}
