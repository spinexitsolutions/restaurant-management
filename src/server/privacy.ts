import "server-only";
import { db } from "@/lib/db";

export const DELETION_GRACE_DAYS = 30;

/**
 * Removes a guest's personal data on request (DPDP Act). Bills stay for GST records but lose the
 * name and mobile; B2B invoices keep the buyer's GSTIN/business details, which are legally required.
 */
export async function eraseCustomer(restaurantId: string, customerId: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id: customerId, restaurantId } });
    if (!c) return null;
    const mine = { restaurantId, OR: [{ customerId: c.id }, { customerPhone: c.phone }] };
    const orders = await tx.order.updateMany({ where: mine, data: { customerName: null, customerPhone: null, customerId: null } });
    await tx.reservation.updateMany({
      where: { restaurantId, OR: [{ customerId: c.id }, { phone: c.phone }] },
      data: { name: "Deleted guest", phone: "", note: null, customerId: null },
    });
    await tx.couponRedemption.updateMany({ where: { customerId: c.id }, data: { customerId: null } });
    await tx.customer.delete({ where: { id: c.id } }); // loyalty history goes with it
    return { orders: orders.count, phoneEnd: c.phone.slice(-4) };
  });
}

/** Owner asked to close the account: every outlet of the organisation is deleted after the grace period. */
export async function scheduleAccountDeletion(organizationId: string, now = new Date()) {
  const at = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000);
  await db.restaurant.updateMany({ where: { organizationId }, data: { deletionScheduledAt: at } });
  return at;
}

export async function cancelAccountDeletion(organizationId: string) {
  await db.restaurant.updateMany({ where: { organizationId }, data: { deletionScheduledAt: null } });
}

/** Daily job: permanently deletes organisations whose grace period is over (cascades to all data). */
export async function purgeDeletedAccounts(now = new Date()) {
  const due = await db.restaurant.findMany({ where: { deletionScheduledAt: { lte: now } }, select: { organizationId: true }, distinct: ["organizationId"] });
  let purged = 0;
  for (const { organizationId } of due) {
    // Only when every outlet is still scheduled (a cancel clears them all).
    const pending = await db.restaurant.count({ where: { organizationId, OR: [{ deletionScheduledAt: null }, { deletionScheduledAt: { gt: now } }] } });
    if (pending) continue;
    await db.organization.delete({ where: { id: organizationId } });
    purged++;
  }
  return purged;
}
