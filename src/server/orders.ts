import "server-only";
import type { KotStatus, OrderSource, OrderType, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { buildCartLine, validateAddons, type MenuItemData } from "@/lib/cart";
import { toPaise } from "@/lib/gst";
import { formatInvoiceNumber, financialYear, istDate } from "@/lib/numbering";
import { orderBill, paiseToRupees } from "@/lib/order-bill";

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
    include: { category: { select: { isActive: true } }, variants: true, addonGroups: { include: { options: true } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  return inputs.map((input) => {
    const item = byId.get(input.itemId);
    if (!item || !item.category.isActive) throw new OrderError("An item in your order is no longer on the menu");
    if (!item.isAvailable) throw new OrderError(`${item.name} is sold out`);
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
  };
  lines: LineInput[];
  kotStatus: KotStatus;
  createdById: string | null;
  note?: string | null;
}

/**
 * Adds a KOT to an order, creating the order first if needed. A dine-in table has at most one
 * running order, so items for an occupied table are appended to it.
 */
export async function placeItems(input: PlaceItemsInput) {
  return db.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: input.restaurantId } });
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
        status: input.kotStatus,
        note: input.note?.trim().slice(0, 200) || null,
        createdById: input.createdById,
        items: { create: items.map((i) => ({ ...i, orderId: order!.id })) },
      },
    });
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
    const billable = order.items.filter((i) => i.kot.status === "ACCEPTED");
    if (!billable.some((i) => i.status !== "CANCELLED")) throw new OrderError("There are no items to bill");

    const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const serviceChargeRate = r.serviceChargeEnabled ? r.serviceChargeRate : 0;
    const bill = orderBill(billable, { gstEnabled: r.gstEnabled, gstMode: r.gstMode, serviceChargeRate }, { type: order.discountType, value: order.discountValue });

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: "BILLED",
        billedAt: new Date(),
        invoiceNumber: order.invoiceNumber ?? (await nextInvoiceNumber(tx, restaurantId)),
        gstEnabled: r.gstEnabled,
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
    await bumpLive(tx, restaurantId);
  });
}

export async function recordPayment(
  restaurantId: string,
  orderId: string,
  payment: {
    method: "CASH" | "UPI" | "CARD" | "RAZORPAY" | "OTHER";
    amountPaise: number;
    reference?: string | null;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    receivedById?: string | null;
  },
) {
  return db.$transaction(async (tx) => {
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
      },
    });
    const updated =
      paid + payment.amountPaise >= total
        ? await tx.order.update({ where: { id: orderId }, data: { status: "PAID", paidAt: new Date() } })
        : order;
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
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelReason: reason.trim() } });
    await tx.orderItem.updateMany({ where: { orderId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelReason: "Order cancelled" } });
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
