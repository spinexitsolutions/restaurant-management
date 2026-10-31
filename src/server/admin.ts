import "server-only";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getSession, getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptionStatus } from "@/lib/plans";

/** Signed-in platform admin, or a redirect to the login page. */
export async function requireSuperAdmin() {
  const user = await getValidUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/login");
  const session = await getSession();
  return { id: user.id, name: session?.name ?? "Admin" };
}

export const ADMIN_FILTERS = {
  all: "All",
  trial: "On trial",
  paying: "Paying",
  due: "Renewal due (7 days)",
  expired: "Expired",
  suspended: "Suspended",
  inactive: "No orders in 7 days",
} as const;
export type AdminFilter = keyof typeof ADMIN_FILTERS;

export interface AdminRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  plan: string;
  planExpiresAt: Date | null;
  state: "ACTIVE" | "GRACE" | "EXPIRED";
  daysLeft: number;
  isActive: boolean;
  createdAt: Date;
  owner: { name: string; email: string; phone: string | null } | null;
  outlets: number;
  orgName: string;
  reseller: string | null;
  lastOrderAt: Date | null;
  orders30: number;
  deletionScheduledAt: Date | null;
}

/** Every outlet with the numbers the platform team needs, filtered and searched. */
export async function adminRestaurants(filter: AdminFilter, q: string, now = new Date()): Promise<AdminRow[]> {
  const search = q.trim();
  const where: Prisma.RestaurantWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          { slug: { contains: search.toLowerCase() } },
          { phone: { contains: search } },
          { users: { some: { role: "OWNER", OR: [{ email: { contains: search.toLowerCase() } }, { phone: { contains: search } }, { name: { contains: search, mode: "insensitive" } }] } } },
        ],
      }
    : {};
  const [restaurants, last, recent] = await Promise.all([
    db.restaurant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true, phone: true } },
        organization: {
          select: {
            name: true,
            reseller: { select: { name: true } },
            _count: { select: { restaurants: true } },
            // An owner of a chain is attached to one outlet; show them on every outlet.
            restaurants: { select: { users: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true, phone: true } } } },
          },
        },
      },
    }),
    db.order.groupBy({ by: ["restaurantId"], _max: { createdAt: true } }),
    db.order.groupBy({ by: ["restaurantId"], where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, _count: true }),
  ]);
  const lastBy = new Map(last.map((l) => [l.restaurantId, l._max.createdAt]));
  const countBy = new Map(recent.map((c) => [c.restaurantId, c._count]));
  const rows: AdminRow[] = restaurants.map((r) => {
    const sub = subscriptionStatus(r.planExpiresAt, now);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      plan: r.plan,
      planExpiresAt: r.planExpiresAt,
      state: sub.state,
      daysLeft: sub.daysLeft,
      isActive: r.isActive,
      createdAt: r.createdAt,
      owner: r.users[0] ?? r.organization.restaurants.flatMap((x) => x.users)[0] ?? null,
      outlets: r.organization._count.restaurants,
      orgName: r.organization.name,
      reseller: r.organization.reseller?.name ?? null,
      lastOrderAt: lastBy.get(r.id) ?? null,
      orders30: countBy.get(r.id) ?? 0,
      deletionScheduledAt: r.deletionScheduledAt,
    };
  });
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const keep: Record<AdminFilter, (r: AdminRow) => boolean> = {
    all: () => true,
    trial: (r) => r.plan === "TRIAL" && r.state !== "EXPIRED",
    paying: (r) => r.plan !== "TRIAL" && r.state !== "EXPIRED",
    due: (r) => r.isActive && r.state !== "EXPIRED" && r.daysLeft <= 7,
    expired: (r) => r.state === "EXPIRED",
    suspended: (r) => !r.isActive,
    inactive: (r) => r.isActive && (!r.lastOrderAt || r.lastOrderAt.getTime() < weekAgo),
  };
  const out = rows.filter(keep[filter]);
  if (filter === "due") out.sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}

/** The organisation's first owner (owners of a chain belong to one outlet). */
export async function ownerOf(restaurantId: string) {
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { organizationId: true } });
  if (!r) return null;
  return db.user.findFirst({
    where: { role: "OWNER", isActive: true, restaurant: { organizationId: r.organizationId } },
    orderBy: [{ createdAt: "asc" }],
  });
}

/** WhatsApp link with a ready-made renewal reminder for the owner. */
export function renewalWhatsApp(row: Pick<AdminRow, "name" | "owner" | "daysLeft" | "plan">, appName: string, billingUrl: string) {
  const phone = row.owner?.phone;
  if (!phone) return null;
  const when = row.daysLeft > 1 ? `in ${row.daysLeft} days` : row.daysLeft === 1 ? "tomorrow" : "today";
  const text =
    row.plan === "TRIAL"
      ? `Hi ${row.owner!.name}, your ${appName} free trial for ${row.name} ends ${when}. Continue without losing your menu and data: ${billingUrl}`
      : `Hi ${row.owner!.name}, your ${appName} plan for ${row.name} ends ${when}. Renew here: ${billingUrl}`;
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
