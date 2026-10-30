import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { upsertCustomer } from "./customers";
import { bumpLive, OrderError } from "./orders";

export const reservationSchema = z.object({
  name: z.string().trim().min(2, "Enter the guest's name").max(60),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  partySize: z.coerce.number().int().min(1, "At least 1 guest").max(50, "For more than 50 guests, please call us"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
  note: z.string().trim().max(200).optional(),
});

/** IST date + HH:mm to an instant. */
export function istDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`);
}

export async function createReservation(
  restaurantId: string,
  input: z.infer<typeof reservationSchema> & { tableId?: string | null },
  source: "STAFF" | "ONLINE",
) {
  const startsAt = istDateTime(input.date, input.time);
  if (startsAt.getTime() < Date.now() - 15 * 60_000) throw new OrderError("That time has already passed");
  if (startsAt.getTime() > Date.now() + 90 * 86_400_000) throw new OrderError("Bookings can be made up to 90 days ahead");
  return db.$transaction(async (tx) => {
    if (input.tableId && !(await tx.diningTable.findFirst({ where: { id: input.tableId, restaurantId } }))) throw new OrderError("Table not found");
    if (source === "ONLINE") {
      const recent = await tx.reservation.count({ where: { restaurantId, phone: input.phone, status: "REQUESTED", createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
      if (recent >= 3) throw new OrderError("You already have booking requests waiting. The restaurant will call you shortly.");
    }
    const customer = await upsertCustomer(tx, restaurantId, input.phone, input.name);
    const r = await tx.reservation.create({
      data: {
        restaurantId,
        customerId: customer.id,
        name: input.name,
        phone: input.phone,
        partySize: input.partySize,
        startsAt,
        tableId: input.tableId || null,
        note: input.note || null,
        status: source === "ONLINE" ? "REQUESTED" : "CONFIRMED",
        source,
      },
    });
    await bumpLive(tx, restaurantId);
    return r;
  });
}

/** Confirmed bookings for the floor map: from 30 min ago to 3 hours ahead, keyed by table. */
export async function upcomingByTable(restaurantId: string) {
  const list = await db.reservation.findMany({
    where: { restaurantId, status: "CONFIRMED", tableId: { not: null }, startsAt: { gte: new Date(Date.now() - 30 * 60_000), lte: new Date(Date.now() + 3 * 3_600_000) } },
    orderBy: { startsAt: "asc" },
  });
  const map = new Map<string, { name: string; partySize: number; startsAt: string }>();
  for (const r of list) if (!map.has(r.tableId!)) map.set(r.tableId!, { name: r.name, partySize: r.partySize, startsAt: r.startsAt.toISOString() });
  return map;
}

export function todayIst() {
  return istDate();
}
