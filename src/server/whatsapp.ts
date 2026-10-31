import "server-only";
import type { Restaurant } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { daysUntil } from "@/lib/crm";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { istDate } from "@/lib/numbering";
import { appUrl } from "@/lib/utils";
import { GRAPH_VERSION, templatePayload, toWaNumber } from "@/lib/whatsapp";
import { startOfIstDay } from "./stats";
import { winbackDue } from "@/lib/winback";

type Kind = "BILL" | "BOOKING" | "BIRTHDAY" | "ANNIVERSARY" | "SUMMARY" | "WINBACK" | "TEST";

const WINBACK_DAILY_LIMIT = 200;

/** Customers due a "we miss you" message, oldest absence first. */
export async function winbackCandidates(r: Pick<Restaurant, "id" | "winbackDays">, now: Date, limit: number) {
  const cutoff = new Date(now.getTime() - r.winbackDays * 86_400_000);
  const rows = await db.customer.findMany({
    where: { restaurantId: r.id, marketingOptOut: false, visits: { gte: 1 }, lastVisitAt: { lte: cutoff } },
    orderBy: { lastVisitAt: "asc" },
    take: limit * 5,
  });
  return rows.filter((c) => winbackDue(c, now, r.winbackDays)).slice(0, limit);
}

export function waConfigured(r: Pick<Restaurant, "waPhoneNumberId" | "waAccessTokenEnc">) {
  return !!(r.waPhoneNumberId && r.waAccessTokenEnc);
}

/** Sends one template message and logs the result. Never throws: messaging must not break billing. */
export async function sendTemplate(r: Restaurant, kind: Kind, phone: string, template: string | null, params: string[], lang = r.waTemplateLang) {
  if (!template || !waConfigured(r)) return { ok: false as const, error: "WhatsApp is not set up" };
  const to = toWaNumber(phone);
  if (!to) return { ok: false as const, error: "Invalid mobile number" };
  let status = "FAILED";
  let error: string | null = null;
  let providerId: string | null = null;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${r.waPhoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${decrypt(r.waAccessTokenEnc!)}`, "Content-Type": "application/json" },
      body: JSON.stringify(templatePayload(to, template, lang, params)),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (res.ok) {
      status = "SENT";
      providerId = json.messages?.[0]?.id ?? null;
    } else {
      error = json.error?.message ?? `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Network error";
  }
  await db.whatsAppMessage.create({ data: { restaurantId: r.id, to, template, kind, status, error: error?.slice(0, 300), providerId } }).catch(() => {});
  return status === "SENT" ? { ok: true as const } : { ok: false as const, error: error ?? "Failed" };
}

/** After a bill is fully paid: send the customer a link to their bill. */
export async function notifyBillPaid(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { restaurant: true } });
  if (!order || order.status !== "PAID" || !order.customerPhone || order.channel || !order.restaurant.waBillTemplate) return;
  // Checkout and the webhook can both report the same payment: send once per bill.
  const to = toWaNumber(order.customerPhone);
  const already = to && (await db.whatsAppMessage.findFirst({ where: { restaurantId: order.restaurantId, kind: "BILL", to, status: "SENT", createdAt: { gte: order.paidAt ?? order.updatedAt } } }));
  if (already) return;
  await sendTemplate(order.restaurant, "BILL", order.customerPhone, order.restaurant.waBillTemplate, [
    order.customerName || "there",
    order.restaurant.name,
    formatINR(toPaise(order.grandTotal ?? 0)),
    appUrl(`/i/${order.publicToken}`),
  ]);
}

export async function notifyBooking(reservationId: string) {
  const r = await db.reservation.findUnique({ where: { id: reservationId }, include: { restaurant: true } });
  if (!r || r.status !== "CONFIRMED" || !r.restaurant.waBookingTemplate) return;
  const when = r.startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  await sendTemplate(r.restaurant, "BOOKING", r.phone, r.restaurant.waBookingTemplate, [r.name, r.restaurant.name, when, String(r.partySize)]);
}

/**
 * Daily job (run once a morning): birthday/anniversary wishes, yesterday's summary to the owner,
 * and closing shifts left open for more than 16 hours.
 */
export async function runDailyJobs(now: Date = new Date()) {
  const today = istDate(now);
  const year = Number(today.slice(0, 4));
  const stats = { wishes: 0, summaries: 0, shiftsClosed: 0, winbacks: 0 };

  const stale = await db.attendance.updateMany({
    where: { clockOut: null, clockIn: { lt: new Date(now.getTime() - 16 * 3_600_000) } },
    data: { clockOut: new Date(now.getTime()), note: "Closed automatically (no clock-out)" },
  });
  stats.shiftsClosed = stale.count;

  const restaurants = await db.restaurant.findMany({ where: { isActive: true, waPhoneNumberId: { not: null }, waAccessTokenEnc: { not: null } } });
  for (const r of restaurants) {
    if (r.waBirthdayTemplate) {
      const customers = await db.customer.findMany({
        where: { restaurantId: r.id, marketingOptOut: false, OR: [{ birthday: today.slice(5) }, { anniversary: today.slice(5) }] },
      });
      for (const c of customers) {
        if (c.birthday && daysUntil(c.birthday, today) === 0 && c.lastBirthdayWish !== year) {
          const res = await sendTemplate(r, "BIRTHDAY", c.phone, r.waBirthdayTemplate, [c.name || "there", r.name]);
          if (res.ok) {
            await db.customer.update({ where: { id: c.id }, data: { lastBirthdayWish: year } });
            stats.wishes++;
          }
        }
        if (c.anniversary && daysUntil(c.anniversary, today) === 0 && c.lastAnniversaryWish !== year) {
          const res = await sendTemplate(r, "ANNIVERSARY", c.phone, r.waBirthdayTemplate, [c.name || "there", r.name]);
          if (res.ok) {
            await db.customer.update({ where: { id: c.id }, data: { lastAnniversaryWish: year } });
            stats.wishes++;
          }
        }
      }
    }
    if (r.winbackEnabled && r.waWinbackTemplate) {
      for (const c of await winbackCandidates(r, now, WINBACK_DAILY_LIMIT)) {
        const res = await sendTemplate(r, "WINBACK", c.phone, r.waWinbackTemplate, [c.name || "there", r.name, r.winbackOffer]);
        if (res.ok) {
          await db.customer.update({ where: { id: c.id }, data: { lastWinbackAt: now } });
          stats.winbacks++;
        }
      }
    }
    const owner = r.whatsappNumber || r.phone;
    if (r.waSummaryTemplate && owner) {
      const end = startOfIstDay(now);
      const start = new Date(end.getTime() - 86_400_000);
      const sales = await db.order.aggregate({ where: { restaurantId: r.id, status: "PAID", paidAt: { gte: start, lt: end } }, _sum: { grandTotal: true }, _count: true });
      const res = await sendTemplate(r, "SUMMARY", owner, r.waSummaryTemplate, [r.name, istDate(start), formatINR(toPaise(sales._sum.grandTotal ?? 0)), String(sales._count)]);
      if (res.ok) stats.summaries++;
    }
  }
  return stats;
}
