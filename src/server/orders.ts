import "server-only";
import type { KotStatus, Order, OrderSource, OrderType, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { buildCartLine, validateAddons, type MenuItemData } from "@/lib/cart";
import { toPaise } from "@/lib/gst";
import { formatInvoiceNumber, financialYear, istDate } from "@/lib/numbering";
import { orderBill, paiseToRupees } from "@/lib/order-bill";
import { subscriptionStatus } from "@/lib/plans";
import { COURSES, holdPlan, nextCourse } from "@/lib/courses";
import { onBilled, onPaid, refundPoints } from "./customers";
import { consumeItems, returnItems } from "./inventory";
import { enqueueBill, enqueueKot } from "./printing";

type Tx = Prisma.TransactionClient;

export const ORDER_ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER", "WAITER"];
export const KITCHEN_ROLES: Role[] = ["OWNER", "MANAGER", "CHEF"];
export const BILLING_ROLES: Role[] = ["OWNER", "MANAGER", "CASHIER"];

export class OrderError extends Error {}

export async function bumpLive(tx: Tx, restaurantId: string) {
  await tx.restaurant.update({ where: { id: restaurantId }, data: { liveVersion: { increment: 1 } } });
}

/** Atomically takes the next daily order or KOT number; both counters restart every day (IST). */
async function nextDailyNumber(tx: Tx, restaurantId: string, kind: "order" | "kot"): Promise<number> {
  const today = istDate();
  const isOrder = kind === "order" ? 1 : 0;
  const isKot = 1 - isOrder;
  const [row] = await tx.$queryRaw<{ nextOrderNumber: number; nextKotNumber: number }[]>`
    UPDATE "Restaurant" SET
      "nextOrderNumber" = CASE WHEN "orderSeqDate" IS DISTINCT FROM ${today} THEN 1 ELSE "nextOrderNumber" END + ${isOrder}::int,
      "nextKotNumber"   = CASE WHEN "orderSeqDate" IS DISTINCT FROM ${today} THEN 1 ELSE "nextKotNumber" END + ${isKot}::int,
      "orderSeqDate" = ${today}
    WHERE id = ${restaurantId}
    RETURNING "nextOrderNumber", "nextKotNumber"`;
  return (kind === "order" ? row.nextOrderNumber : row.nextKotNumber) - 1;
}

/** Atomically takes the next invoice number in the current financial year's series. */
async function nextInvoiceNumber(tx: Tx, restaurantId: string): Promise<string> {
  const fy = financialYear();
  const [row] = await tx.$queryRaw<{ nextInvoiceNumber: number; invoicePrefix: string }[]>`
    UPDATE "Restaurant" SET
      "nextInvoiceNumber" = CASE WHEN "invoiceSeqFy" IS DISTINCT FROM ${fy} THEN 1 ELSE "nextInvoiceNumber" END + 1,
      "invoiceSeqFy" = ${fy}
    WHERE id = ${restaurantId}
    RETURNING "nextInvoiceNumber", "invoicePrefix"`;
  return formatInvoiceNumber(row.invoicePrefix, fy, row.nextInvoiceNumber - 1);
}

export interface LineInput {
  itemId: string;
  variantId: string | null;
  addonIds: string[];
  quantity: number;
  note?: string;
}

/** Prices every line from the database; the client only says what was chosen, never what it costs. */
async function resolveLines(tx: Tx, restaurantId: string, defaultGstRate: number, inputs: LineInput[]) {
  if (inputs.length === 0) throw new OrderError("Add at least one item");
  if (inputs.length > 50) throw new OrderError("Too many items in one order");
  const items = await tx.menuItem.findMany({
    where: { restaurantId, id: { in: [...new Set(inputs.map((i) => i.itemId))] } },
    include: { category: { select: { isActive: true, stationId: true, course: true } }, variants: true, addonGroups: { include: { options: true } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  return inputs.map((input) => {
    const item = byId.get(input.itemId);
    if (!item || !item.category.isActive) throw new OrderError("An item in your order is no longer on the menu");
    if (!item.isAvailable || item.autoSoldOut) throw new OrderError(`${item.name} is sold out`);
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) throw new OrderError("Invalid quantity");
    if (item.variants.length > 0 && !item.variants.some((v) => v.id === input.variantId)) {
      throw new OrderError(`Choose a size for ${item.name}`);
    }
    const data: MenuItemData = {
      id: item.id,
      name: item.name,
      description: null,
      price: toPaise(item.price),
      imageUrl: null,
      foodType: item.foodType,
      gstRate: item.gstRate === null ? defaultGstRate : Number(item.gstRate),
      isAvailable: true,
      isBestseller: false,
      spiceLevel: 0,
      variants: item.variants.map((v) => ({ id: v.id, name: v.name, price: toPaise(v.price) })),
      addonGroups: item.addonGroups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name, price: toPaise(o.price) })),
      })),
    };
    const addonIds = [...new Set(input.addonIds)];
    const addonError = validateAddons(data, addonIds);
    if (addonError) throw new OrderError(`${item.name}: ${addonError}`);
    const line = buildCartLine(data, input.variantId, addonIds);
    return {
      menuItemId: item.id,
      variantId: line.variantId,
      // Dish's own station, else its category's station, else the main kitchen.
      stationId: item.stationId ?? item.category.stationId ?? null,
      course: item.category.course,
      name: item.name,
      variantName: line.variantName,
      addons: line.addons.map((a) => ({ name: a.name, price: Number(paiseToRupees(a.price)) })),
      foodType: item.foodType,
      unitPrice: paiseToRupees(line.unitPrice),
      quantity: input.quantity,
      gstRate: line.gstRate,
      note: input.note?.trim().slice(0, 140) || null,
    };
  });
}

export interface PlaceItemsInput {
  restaurantId: string;
  orderId?: string;
  newOrder?: {
    type: OrderType;
    tableId?: string | null;
    source: OrderSource;
    waiterId?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    channel?: "ZOMATO" | "SWIGGY" | null;
    channelRef?: string | null;
  };
  lines: LineInput[];
  kotStatus: KotStatus;
  createdById: string | null;
  note?: string | null;
  clientRequestId?: string;
}

/**
 * Adds a KOT to an order, creating the order first if needed. A dine-in table has at most one
 * running order, so items for an occupied table are appended to it.
 */
export async function placeItems(input: PlaceItemsInput) {
  if (input.clientRequestId) {
    // An offline device retrying a KOT it already sent: return the original.
    const existing = await db.kot.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { order: true } });
    if (existing && existing.restaurantId === input.restaurantId) return { order: existing.order, kot: existing };
  }
  return db.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: input.restaurantId } });
    if (subscriptionStatus(restaurant.planExpiresAt).state === "EXPIRED") {
      throw new OrderError(
        input.newOrder?.source === "QR" ? "Ordering is unavailable right now. Please ask the staff." : "Your subscription has expired. Renew it in Billing to take new orders.",
      );
    }
    let order = input.orderId
      ? await tx.order.findFirst({ where: { id: input.orderId, restaurantId: input.restaurantId } })
      : null;
    if (input.orderId && !order) throw new OrderError("Order not found");

    const tableId = input.newOrder?.tableId ?? null;
    let table: { id: string; name: string } | null = null;
    if (!order && tableId) {
      table = await tx.diningTable.findFirst({ where: { id: tableId, restaurantId: input.restaurantId }, select: { id: true, name: true } });
      if (!table) throw new OrderError("Table not found");
      // Serialise concurrent orders for the same table.
      await tx.$executeRaw`SELECT 1 FROM "DiningTable" WHERE id = ${table.id} FOR UPDATE`;
      order = await tx.order.findFirst({ where: { tableId: table.id, status: { in: ["OPEN", "BILLED"] } }, orderBy: { createdAt: "desc" } });
    }
    if (order && order.status === "BILLED") throw new OrderError("The bill for this table is already generated. Ask staff to reopen it.");
    if (order && order.status !== "OPEN") throw new OrderError("This order is closed");

    const items = await resolveLines(tx, input.restaurantId, Number(restaurant.defaultGstRate), input.lines);

    if (!order) {
      const n = input.newOrder;
      if (!n) throw new OrderError("Order not found");
      order = await tx.order.create({
        data: {
          restaurantId: input.restaurantId,
          orderNumber: await nextDailyNumber(tx, input.restaurantId, "order"),
          type: table ? "DINE_IN" : n.type,
          source: n.source,
          tableId: table?.id ?? null,
          tableName: table?.name ?? null,
          waiterId: n.waiterId ?? null,
          customerName: n.customerName?.trim() || null,
          customerPhone: n.customerPhone?.trim() || null,
          channel: table ? null : (n.channel ?? null),
          channelRef: table ? null : n.channelRef?.trim() || null,
        },
      });
    } else if (input.newOrder?.customerName && !order.customerName) {
      order = await tx.order.update({ where: { id: order.id }, data: { customerName: input.newOrder.customerName.trim() } });
    }

    const kot = await tx.kot.create({
      data: {
        restaurantId: input.restaurantId,
        orderId: order.id,
        kotNumber: await nextDailyNumber(tx, input.restaurantId, "kot"),
        clientRequestId: input.clientRequestId,
        status: input.kotStatus,
        note: input.note?.trim().slice(0, 200) || null,
        createdById: input.createdById,
        // With course firing on, later courses in a mixed ticket wait for the waiter to fire them.
        items: {
          create: (() => {
            const hold = restaurant.courseFiring ? holdPlan(items.map((i) => i.course)) : items.map(() => false);
            return items.map((i, n) => ({ ...i, orderId: order!.id, held: hold[n] }));
          })(),
        },
      },
    });
    if (input.kotStatus === "ACCEPTED") {
      await consumeItems(tx, input.restaurantId, { kotId: kot.id });
      await enqueueKot(tx, input.restaurantId, kot.id);
    }
    await bumpLive(tx, input.restaurantId);
    return { order, kot };
  });
}

export async function decideKot(restaurantId: string, kotId: string, accept: boolean) {
  return db.$transaction(async (tx) => {
    const kot = await tx.kot.findFirst({ where: { id: kotId, restaurantId }, include: { order: true } });
    if (!kot) throw new OrderError("Order not found");
    if (kot.status !== "PENDING_APPROVAL") throw new OrderError("This order was already handled");
    await tx.kot.update({ where: { id: kotId }, data: { status: accept ? "ACCEPTED" : "REJECTED" } });
    if (accept) {
      await consumeItems(tx, restaurantId, { kotId });
      await enqueueKot(tx, restaurantId, kotId);
    }
    if (!accept) {
      await tx.orderItem.updateMany({ where: { kotId }, data: { status: "CANCELLED", cancelReason: "Rejected by staff" } });
      // A customer order that was only ever this rejected KOT should not keep the table busy.
      const live = await tx.orderItem.count({ where: { orderId: kot.orderId, status: { not: "CANCELLED" } } });
      if (live === 0) await tx.order.update({ where: { id: kot.orderId }, data: { status: "CANCELLED", cancelReason: "Rejected by staff" } });
    }
    await bumpLive(tx, restaurantId);
  });
}

const NEXT_STATUS = { NEW: "PREPARING", PREPARING: "READY", READY: "SERVED" } as const;

export async function advanceItems(restaurantId: string, itemIds: string[], to?: "PREPARING" | "READY" | "SERVED") {
  return db.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({
      where: { id: { in: itemIds }, order: { restaurantId }, kot: { status: "ACCEPTED" }, status: { in: ["NEW", "PREPARING", "READY"] } },
    });
    for (const item of items) {
      const target = to ?? NEXT_STATUS[item.status as keyof typeof NEXT_STATUS];
      await tx.orderItem.update({ where: { id: item.id }, data: { status: target } });
    }
    if (items.length) await bumpLive(tx, restaurantId);
    return items.length;
  });
}

export async function cancelItem(restaurantId: string, itemId: string, reason: string, role: Role) {
  return db.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, order: { restaurantId } }, include: { order: true } });
    if (!item) throw new OrderError("Item not found");
    if (item.order.status !== "OPEN") throw new OrderError("Reopen the bill before changing items");
    if (item.status === "CANCELLED") return;
    if (role === "WAITER" && item.status !== "NEW") throw new OrderError("The kitchen has started this item. Ask the manager or cashier to cancel it.");
    if (item.status !== "NEW" && reason.trim().length < 3) throw new OrderError("Enter a reason for cancelling");
    await tx.orderItem.update({ where: { id: itemId }, data: { status: "CANCELLED", cancelReason: reason.trim() || "Cancelled" } });
    // Food the kitchen hadn't started goes back into stock; started food counts as used.
    if (item.status === "NEW") await returnItems(tx, restaurantId, [itemId]);
    // Tell the kitchen printer, which already printed this item.
    const kot = await tx.kot.findUnique({ where: { id: item.kotId }, select: { status: true } });
    if (kot?.status === "ACCEPTED") {
      await enqueueKot(tx, restaurantId, item.kotId, {
        cancelled: { name: item.name, variantName: item.variantName, quantity: item.quantity, stationId: item.stationId, reason: reason.trim() || "Cancelled" },
      });
    }
    await bumpLive(tx, restaurantId);
  });
}

export async function setDiscount(restaurantId: string, orderId: string, discount: { type: "PERCENT" | "FLAT"; value: number; note: string } | null) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "OPEN") throw new OrderError("Reopen the bill to change the discount");
    if (discount && (discount.value < 0 || (discount.type === "PERCENT" && discount.value > 100))) throw new OrderError("Invalid discount");
    await tx.order.update({
      where: { id: orderId },
      data: discount?.value
        ? { discountType: discount.type, discountValue: discount.value, discountNote: discount.note.trim() || null }
        : { discountType: null, discountValue: null, discountNote: null },
    });
    await bumpLive(tx, restaurantId);
  });
}

export async function generateBill(restaurantId: string, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { kot: { select: { status: true } } } }, kots: { select: { status: true } } },
    });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "OPEN") throw new OrderError("This order is already billed");
    if (order.kots.some((k) => k.status === "PENDING_APPROVAL")) throw new OrderError("Accept or reject the pending customer order first");
    if (order.items.some((i) => i.held && i.status !== "CANCELLED")) throw new OrderError("Some courses are still on hold. Fire or cancel them before billing.");
    const billable = order.items.filter((i) => i.kot.status === "ACCEPTED");
    if (!billable.some((i) => i.status !== "CANCELLED")) throw new OrderError("There are no items to bill");

    const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    // Zomato/Swiggy collect and pay GST on restaurant orders themselves (Section 9(5), CGST Act),
    // so the restaurant's bill for these carries no GST and no service charge.
    const aggregator = !!order.channel;
    const serviceChargeRate = !aggregator && r.serviceChargeEnabled ? r.serviceChargeRate : 0;
    const gstEnabled = r.gstEnabled && !aggregator;
    const bill = orderBill(
      billable,
      { gstEnabled, gstMode: r.gstMode, serviceChargeRate },
      { type: order.discountType, value: order.discountValue },
      toPaise(order.pointsRedeemValue),
    );

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: "BILLED",
        billedAt: new Date(),
        invoiceNumber: order.invoiceNumber ?? (await nextInvoiceNumber(tx, restaurantId)),
        gstEnabled,
        gstMode: r.gstMode,
        serviceChargeRate,
        subtotal: paiseToRupees(bill.subtotal),
        discountAmount: paiseToRupees(bill.discount),
        serviceCharge: paiseToRupees(bill.serviceCharge),
        cgst: paiseToRupees(bill.cgst),
        sgst: paiseToRupees(bill.sgst),
        roundOff: paiseToRupees(bill.roundOff),
        grandTotal: paiseToRupees(bill.grandTotal),
      },
    });
    if (order.tableId) {
      await tx.serviceRequest.updateMany({ where: { tableId: order.tableId, type: "REQUEST_BILL", resolvedAt: null }, data: { resolvedAt: new Date() } });
    }
    await onBilled(tx, updated);
    await enqueueBill(tx, restaurantId, orderId);
    await bumpLive(tx, restaurantId);
    return updated;
  });
}

/** Moves a billed order back to OPEN so items can change. The invoice number is kept. */
export async function reopenBill(restaurantId: string, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { _count: { select: { payments: true } } } });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "BILLED") throw new OrderError("Only a billed order can be reopened");
    if (order._count.payments > 0) throw new OrderError("A payment is already recorded on this bill");
    await tx.order.update({ where: { id: orderId }, data: { status: "OPEN", billedAt: null } });
    await refundPoints(tx, order);
    await bumpLive(tx, restaurantId);
  });
}

export async function recordPayment(
  restaurantId: string,
  orderId: string,
  payment: {
    method: "CASH" | "UPI" | "CARD" | "RAZORPAY" | "AGGREGATOR" | "OTHER";
    amountPaise: number;
    reference?: string | null;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    receivedById?: string | null;
    clientRequestId?: string;
  },
) {
  return db.$transaction(async (tx) => {
    if (payment.clientRequestId) {
      const existing = await tx.payment.findUnique({ where: { clientRequestId: payment.clientRequestId }, include: { order: true } });
      if (existing) return existing.order;
    }
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { payments: true } });
    if (!order) throw new OrderError("Order not found");
    if (payment.razorpayPaymentId && order.payments.some((p) => p.razorpayPaymentId === payment.razorpayPaymentId)) return order;
    if (order.status !== "BILLED") throw new OrderError(order.status === "PAID" ? "This bill is already paid" : "Generate the bill first");
    const total = toPaise(order.grandTotal!);
    const paid = order.payments.reduce((s, p) => s + toPaise(p.amount), 0);
    const due = total - paid;
    if (payment.amountPaise <= 0) throw new OrderError("Enter an amount");
    // Online payments are captured by the gateway, so record them even if they exceed what's due.
    if (payment.method !== "RAZORPAY" && payment.amountPaise > due) throw new OrderError(`Only ${paiseToRupees(due)} is due`);

    await tx.payment.create({
      data: {
        orderId,
        method: payment.method,
        amount: paiseToRupees(payment.amountPaise),
        reference: payment.reference?.trim() || null,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        receivedById: payment.receivedById ?? null,
        clientRequestId: payment.clientRequestId,
      },
    });
    let updated: Order = order;
    if (paid + payment.amountPaise >= total) {
      updated = await tx.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt: new Date() } });
      await onPaid(tx, updated);
    }
    await bumpLive(tx, restaurantId);
    return updated;
  });
}

export async function cancelOrder(restaurantId: string, orderId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { _count: { select: { payments: true } } } });
    if (!order) throw new OrderError("Order not found");
    if (order.status === "PAID" || order.status === "CANCELLED") throw new OrderError("This order is already closed");
    if (order._count.payments > 0) throw new OrderError("A payment is recorded on this order");
    if (reason.trim().length < 3) throw new OrderError("Enter a reason for cancelling");
    const unstarted = await tx.orderItem.findMany({ where: { orderId, status: "NEW" }, select: { id: true } });
    await returnItems(tx, restaurantId, unstarted.map((i) => i.id));
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
    await tx.orderItem.updateMany({ where: { orderId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelReason: "Order cancelled" } });
    await refundPoints(tx, order);
    await tx.kot.updateMany({ where: { orderId, status: "PENDING_APPROVAL" }, data: { status: "REJECTED" } });
    await bumpLive(tx, restaurantId);
  });
}

/** Customer-side request from a table (call waiter, ask for bill, water). Duplicate open requests are ignored. */
export async function createServiceRequest(restaurantId: string, tableId: string, type: "CALL_WAITER" | "REQUEST_BILL" | "WATER") {
  return db.$transaction(async (tx) => {
    const open = await tx.serviceRequest.findFirst({ where: { tableId, type, resolvedAt: null } });
    if (open) return open;
    const created = await tx.serviceRequest.create({ data: { restaurantId, tableId, type } });
    await bumpLive(tx, restaurantId);
    return created;
  });
}

export async function resolveServiceRequest(restaurantId: string, id: string) {
  return db.$transaction(async (tx) => {
    await tx.serviceRequest.updateMany({ where: { id, restaurantId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    await bumpLive(tx, restaurantId);
  });
}

async function lockedRunningOrder(tx: Tx, restaurantId: string, orderId: string) {
  await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { _count: { select: { payments: true } } } });
  if (!order) throw new OrderError("Order not found");
  return order;
}

/** Moves a running order to a free table. */
export async function transferOrder(restaurantId: string, orderId: string, toTableId: string) {
  return db.$transaction(async (tx) => {
    const order = await lockedRunningOrder(tx, restaurantId, orderId);
    if (order.status !== "OPEN" && order.status !== "BILLED") throw new OrderError("This order is closed");
    const table = await tx.diningTable.findFirst({ where: { id: toTableId, restaurantId } });
    if (!table) throw new OrderError("Table not found");
    await tx.$executeRaw`SELECT 1 FROM "DiningTable" WHERE id = ${table.id} FOR UPDATE`;
    const busy = await tx.order.findFirst({ where: { tableId: table.id, status: { in: ["OPEN", "BILLED"] } } });
    if (busy) throw new OrderError(`Table ${table.name} already has a running order. Use merge instead.`);
    await tx.order.update({ where: { id: orderId }, data: { tableId: table.id, tableName: table.name, type: "DINE_IN" } });
    if (order.tableId) await tx.serviceRequest.updateMany({ where: { tableId: order.tableId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    await bumpLive(tx, restaurantId);
    return { from: order.tableName, to: table.name };
  });
}

/** Moves every item of `sourceId` into `targetId` and closes the source order. */
export async function mergeOrders(restaurantId: string, targetId: string, sourceId: string) {
  if (targetId === sourceId) throw new OrderError("Pick a different order to merge");
  return db.$transaction(async (tx) => {
    const [target, source] = [await lockedRunningOrder(tx, restaurantId, targetId), await lockedRunningOrder(tx, restaurantId, sourceId)];
    for (const o of [target, source]) {
      if (o.status !== "OPEN") throw new OrderError(`Order #${o.orderNumber} is already billed. Reopen it first.`);
      if (o._count.payments > 0) throw new OrderError(`Order #${o.orderNumber} has a payment recorded`);
    }
    // The source's discount or points would silently disappear, so make staff decide explicitly.
    if ((source.discountValue && Number(source.discountValue) > 0) || source.pointsRedeemed > 0) {
      throw new OrderError(`Order #${source.orderNumber} has a discount. Remove it first, then merge and apply the discount again.`);
    }
    await tx.kot.updateMany({ where: { orderId: sourceId }, data: { orderId: targetId } });
    await tx.orderItem.updateMany({ where: { orderId: sourceId }, data: { orderId: targetId } });
    await tx.order.update({
      where: { id: sourceId },
      data: { status: "CANCELLED", cancelReason: `Merged into order #${target.orderNumber}${target.tableName ? ` (Table ${target.tableName})` : ""}` },
    });
    if (source.tableId) await tx.serviceRequest.updateMany({ where: { tableId: source.tableId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    await bumpLive(tx, restaurantId);
    return { target: target.orderNumber, source: source.orderNumber };
  });
}

/**
 * Moves the chosen quantities of items into a new order so they can be billed separately.
 * The new order keeps the table name but is not linked to the table, so the table keeps one running order.
 */
export async function splitOrder(restaurantId: string, orderId: string, parts: { itemId: string; quantity: number }[], createdById: string) {
  return db.$transaction(async (tx) => {
    const order = await lockedRunningOrder(tx, restaurantId, orderId);
    if (order.status !== "OPEN") throw new OrderError("Reopen the bill before splitting");
    if (order.pointsRedeemed > 0) throw new OrderError("Remove the loyalty points from this bill before splitting");
    const items = await tx.orderItem.findMany({ where: { orderId, status: { not: "CANCELLED" }, kot: { status: "ACCEPTED" } } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const chosen = parts.filter((p) => p.quantity > 0);
    if (chosen.length === 0) throw new OrderError("Choose items to move to the new bill");

    let remaining = items.reduce((s, i) => s + i.quantity, 0);
    for (const p of chosen) {
      const item = byId.get(p.itemId);
      if (!item || !Number.isInteger(p.quantity) || p.quantity > item.quantity) throw new OrderError("Invalid item or quantity");
      remaining -= p.quantity;
    }
    if (remaining <= 0) throw new OrderError("Leave at least one item on the original bill");

    const split = await tx.order.create({
      data: {
        restaurantId,
        orderNumber: await nextDailyNumber(tx, restaurantId, "order"),
        type: order.type,
        source: "STAFF",
        tableName: order.tableName ? `${order.tableName} (split)` : null,
        waiterId: order.waiterId,
        note: `Split from order #${order.orderNumber}`,
      },
    });
    const kot = await tx.kot.create({
      data: { restaurantId, orderId: split.id, kotNumber: 0, status: "ACCEPTED", note: `Moved from order #${order.orderNumber}`, createdById },
    });
    for (const p of chosen) {
      const item = byId.get(p.itemId)!;
      if (p.quantity === item.quantity) {
        await tx.orderItem.update({ where: { id: item.id }, data: { orderId: split.id, kotId: kot.id } });
      } else {
        await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity - p.quantity } });
        await tx.orderItem.create({
          data: {
            orderId: split.id,
            kotId: kot.id,
            quantity: p.quantity,
            menuItemId: item.menuItemId,
            name: item.name,
            variantName: item.variantName,
            addons: item.addons ?? [],
            foodType: item.foodType,
            unitPrice: item.unitPrice,
            gstRate: item.gstRate,
            note: item.note,
            status: item.status,
            variantId: item.variantId,
            stockDeducted: item.stockDeducted,
            stationId: item.stationId,
          },
        });
      }
    }
    await bumpLive(tx, restaurantId);
    return split;
  });
}

/** Links a customer (by mobile) to a running order. */
export async function setOrderCustomer(restaurantId: string, orderId: string, phone: string, name: string) {
  const { upsertCustomer } = await import("./customers");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "OPEN") throw new OrderError("Reopen the bill to change the customer");
    if (!phone) {
      if (order.pointsRedeemed > 0) throw new OrderError("Remove the redeemed points first");
      await tx.order.update({ where: { id: orderId }, data: { customerId: null, customerPhone: null } });
    } else {
      const customer = await upsertCustomer(tx, restaurantId, phone, name.trim() || order.customerName);
      if (order.pointsRedeemed > 0 && order.customerId !== customer.id) throw new OrderError("Remove the redeemed points before changing the customer");
      await tx.order.update({
        where: { id: orderId },
        data: { customerId: customer.id, customerPhone: phone, customerName: customer.name ?? order.customerName },
      });
    }
    await bumpLive(tx, restaurantId);
  });
}

/** Applies (or with 0, removes) loyalty points as a discount on a running order. */
export async function redeemPoints(restaurantId: string, orderId: string, points: number) {
  const { checkRedemption, redeemValuePaise } = await import("@/lib/loyalty");
  const { loyaltySettings } = await import("./customers");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: { include: { kot: { select: { status: true } } } }, customer: true } });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "OPEN") throw new OrderError("Reopen the bill to change points");
    if (points === 0) {
      await tx.order.update({ where: { id: orderId }, data: { pointsRedeemed: 0, pointsRedeemValue: 0 } });
      await bumpLive(tx, restaurantId);
      return;
    }
    const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    if (!r.loyaltyEnabled) throw new OrderError("Loyalty points are turned off");
    if (!order.customer) throw new OrderError("Add the customer's mobile number first");
    const s = loyaltySettings(r);
    const before = orderBill(
      order.items.filter((i) => i.kot.status === "ACCEPTED"),
      { gstEnabled: r.gstEnabled, gstMode: r.gstMode, serviceChargeRate: r.serviceChargeEnabled ? r.serviceChargeRate : 0 },
      { type: order.discountType, value: order.discountValue },
    );
    const error = checkRedemption(points, order.customer.points, before.subtotal - before.discount, s);
    if (error) throw new OrderError(error);
    await tx.order.update({ where: { id: orderId }, data: { pointsRedeemed: points, pointsRedeemValue: paiseToRupees(redeemValuePaise(points, s)) } });
    await bumpLive(tx, restaurantId);
  });
}

/** B2B: prints the buyer's GSTIN, legal name and address on the tax invoice. Empty gstin clears it. */
export async function setOrderBuyer(restaurantId: string, orderId: string, buyer: { gstin: string; name: string; address: string }) {
  const { gstinError } = await import("@/lib/gstin");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new OrderError("Order not found");
    if (order.status !== "OPEN") throw new OrderError("Reopen the bill to change the buyer's GST details");
    if (order.channel) throw new OrderError("Aggregator orders are billed without GST, so they can't carry a buyer GSTIN");
    const gstin = buyer.gstin.trim().toUpperCase();
    if (!gstin) {
      await tx.order.update({ where: { id: orderId }, data: { buyerGstin: null, buyerName: null, buyerAddress: null } });
    } else {
      const err = gstinError(gstin);
      if (err) throw new OrderError(err);
      if (buyer.name.trim().length < 2) throw new OrderError("Enter the buyer's registered business name");
      const data = { buyerGstin: gstin, buyerName: buyer.name.trim().slice(0, 120), buyerAddress: buyer.address.trim().slice(0, 300) || null };
      await tx.order.update({ where: { id: orderId }, data });
      // Remember it on the customer so it fills in next time.
      if (order.customerId) {
        await tx.customer.update({ where: { id: order.customerId }, data: { gstin, businessName: data.buyerName, businessAddress: data.buyerAddress } });
      }
    }
    await bumpLive(tx, restaurantId);
  });
}

/** Sends the next held course of an order to the kitchen (screen and printer). */
export async function fireNextCourse(restaurantId: string, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new OrderError("Order not found");
    const held = await tx.orderItem.findMany({ where: { orderId, held: true, status: { not: "CANCELLED" }, kot: { status: "ACCEPTED" } } });
    const course = nextCourse(held.map((i) => i.course));
    if (course === null) throw new OrderError("Nothing is on hold");
    const firing = held.filter((i) => i.course === course);
    await tx.orderItem.updateMany({ where: { id: { in: firing.map((i) => i.id) } }, data: { held: false, firedAt: new Date() } });
    for (const kotId of new Set(firing.map((i) => i.kotId))) {
      await enqueueKot(tx, restaurantId, kotId, { onlyItemIds: firing.filter((i) => i.kotId === kotId).map((i) => i.id), heading: `FIRE ${COURSES[course].toUpperCase()}` });
    }
    await bumpLive(tx, restaurantId);
    return { course: COURSES[course], count: firing.length };
  });
}
