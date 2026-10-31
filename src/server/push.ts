import "server-only";
import webpush from "web-push";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { translator, type T } from "@/lib/i18n";

/**
 * Web Push to staff phones (Android Chrome, desktop browsers, and iPhone when the app is added
 * to the home screen). Needs VAPID keys: `npx web-push generate-vapid-keys`.
 */
export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@example.com", pub, priv);
  configured = true;
  return true;
}

export interface PushMessage {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

type Audience = { userIds?: string[]; roles?: Role[] };

/** Sends to every device of the matching active staff, each in their own language. Never throws. */
export async function pushToStaff(restaurantId: string, audience: Audience, build: (t: T) => PushMessage) {
  if (!configure()) return 0;
  const or = [
    ...(audience.userIds?.length ? [{ userId: { in: audience.userIds } }] : []),
    ...(audience.roles?.length ? [{ user: { role: { in: audience.roles } } }] : []),
  ];
  if (!or.length) return 0;
  const subs = await db.pushSubscription.findMany({
    where: { restaurantId, user: { isActive: true }, OR: or },
    include: { user: { select: { language: true } } },
  });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const msg = build(translator(s.user.language));
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 300, urgency: "high" });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the app was uninstalled.
        if (status === 404 || status === 410) await db.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error("push failed", status ?? e);
      }
    }),
  );
  return sent;
}

const place = (t: T, o: { tableName: string | null; orderNumber: number }) => (o.tableName ? t("floor.table", { name: o.tableName }) : t("order.number", { number: o.orderNumber }));

/** Floor staff who should hear about an order: its waiter, else everyone on that duty. */
function audienceFor(o: { waiterId: string | null; tableId: string | null }): Audience {
  if (o.waiterId) return { userIds: [o.waiterId] };
  return { roles: o.tableId ? ["WAITER", "MANAGER"] : ["CASHIER", "MANAGER"] };
}

/** Kitchen marked items ready. */
export async function notifyItemsReady(restaurantId: string, itemIds: string[]) {
  const items = await db.orderItem.findMany({
    where: { id: { in: itemIds }, status: "READY", order: { restaurantId } },
    include: { order: { select: { id: true, tableId: true, tableName: true, orderNumber: true, waiterId: true } } },
  });
  const byOrder = new Map<string, typeof items>();
  for (const i of items) byOrder.set(i.orderId, [...(byOrder.get(i.orderId) ?? []), i]);
  let sent = 0;
  for (const list of byOrder.values()) {
    const o = list[0].order;
    const names = list.map((i) => `${i.quantity}× ${i.name}`).join(", ");
    sent += await pushToStaff(restaurantId, audienceFor(o), (t) => ({
      title: t("push.ready.title", { place: place(t, o) }),
      body: t("push.ready.body", { items: names.length > 120 ? names.slice(0, 117) + "…" : names }),
      url: `/dashboard/orders/${o.id}`,
      tag: `ready-${o.id}`,
    }));
  }
  return sent;
}

const REQUEST_KEY = { CALL_WAITER: "floor.callWaiter", REQUEST_BILL: "floor.wantsBill", WATER: "floor.water" } as const;

/** A guest tapped Call waiter / Bill / Water on their phone. */
export async function notifyServiceRequest(restaurantId: string, tableId: string, type: keyof typeof REQUEST_KEY) {
  const table = await db.diningTable.findFirst({ where: { id: tableId, restaurantId } });
  if (!table) return 0;
  const order = await db.order.findFirst({ where: { tableId, status: { in: ["OPEN", "BILLED"] } }, orderBy: { createdAt: "desc" } });
  const audience: Audience = order?.waiterId ? { userIds: [order.waiterId] } : { roles: type === "REQUEST_BILL" ? ["WAITER", "CASHIER", "MANAGER"] : ["WAITER", "MANAGER"] };
  return pushToStaff(restaurantId, audience, (t) => ({
    title: t("push.request.title", { place: t("floor.table", { name: table.name }) }),
    body: t(REQUEST_KEY[type]),
    url: order ? `/dashboard/orders/${order.id}` : "/dashboard/waiter",
    tag: `request-${tableId}-${type}`,
  }));
}

/** A guest's QR order is waiting for staff to accept it. */
export async function notifyQrOrder(restaurantId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { items: { where: { kot: { status: "PENDING_APPROVAL" } }, select: { quantity: true } } },
  });
  if (!order || !order.items.length) return 0;
  const count = order.items.reduce((s, i) => s + i.quantity, 0);
  const audience: Audience = order.waiterId ? { userIds: [order.waiterId] } : { roles: ["WAITER", "CASHIER", "MANAGER"] };
  return pushToStaff(restaurantId, audience, (t) => ({
    title: t("push.qr.title", { place: place(t, order) }),
    body: t("push.qr.body", { count }),
    url: `/dashboard/orders/${order.id}`,
    tag: `qr-${order.id}`,
  }));
}
