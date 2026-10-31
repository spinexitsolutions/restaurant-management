import "server-only";
import type { Kot, Order, OrderItem, Restaurant } from "@prisma/client";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { orderBill } from "@/lib/order-bill";

export interface BillSummary {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
}

export interface OrderItemView {
  id: string;
  menuItemId: string | null;
  name: string;
  variantName: string | null;
  addons: string[];
  foodType: "VEG" | "NON_VEG" | "EGG";
  quantity: number;
  unitPrice: number;
  status: "NEW" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  held: boolean;
  course: number;
  note: string | null;
  cancelReason: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: number;
  publicToken: string;
  status: "OPEN" | "BILLED" | "PAID" | "CANCELLED";
  type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  channel: "ZOMATO" | "SWIGGY" | null;
  channelRef: string | null;
  source: "QR" | "STAFF";
  tableId: string | null;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  invoiceNumber: string | null;
  discount: { type: "PERCENT" | "FLAT"; value: number; note: string | null } | null;
  points: { redeemed: number; value: number; earned: number };
  customer: { id: string; name: string | null; phone: string; points: number; visits: number; gstin: string | null; businessName: string | null; businessAddress: string | null } | null;
  buyer: { gstin: string; name: string | null; address: string | null } | null;
  createdAt: string;
  kots: {
    id: string;
    kotNumber: number;
    status: "PENDING_APPROVAL" | "ACCEPTED" | "REJECTED";
    note: string | null;
    byCustomer: boolean;
    createdAt: string;
    items: OrderItemView[];
  }[];
  bill: BillSummary;
  paid: number;
  payments: { id: string; method: string; amount: number; reference: string | null; createdAt: string }[];
}

const orderInclude = {
  customer: { select: { id: true, name: true, phone: true, points: true, visits: true, gstin: true, businessName: true, businessAddress: true } },
  kots: { orderBy: { createdAt: "asc" as const }, include: { items: { orderBy: { createdAt: "asc" as const } } } },
  payments: { orderBy: { createdAt: "asc" as const } },
};

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

function findOrder(where: { id: string; restaurantId: string } | { publicToken: string }) {
  return db.order.findFirst({ where, include: orderInclude });
}

export function billFor(order: Order & { kots: (Kot & { items: OrderItem[] })[] }, r: Pick<Restaurant, "gstEnabled" | "gstMode" | "serviceChargeEnabled" | "serviceChargeRate">): BillSummary {
  if (order.status === "BILLED" || order.status === "PAID") {
    return {
      subtotal: toPaise(order.subtotal!),
      discount: toPaise(order.discountAmount!),
      serviceCharge: toPaise(order.serviceCharge!),
      cgst: toPaise(order.cgst!),
      sgst: toPaise(order.sgst!),
      roundOff: toPaise(order.roundOff!),
      grandTotal: toPaise(order.grandTotal!),
    };
  }
  // Running bill: accepted items only, with the restaurant's current settings (no GST for aggregator orders).
  const items = order.kots.filter((k) => k.status === "ACCEPTED").flatMap((k) => k.items);
  const b = orderBill(
    items,
    { gstEnabled: r.gstEnabled && !order.channel, gstMode: r.gstMode, serviceChargeRate: r.serviceChargeEnabled && !order.channel ? r.serviceChargeRate : 0 },
    { type: order.discountType, value: order.discountValue },
    toPaise(order.pointsRedeemValue),
  );
  return { subtotal: b.subtotal, discount: b.discount, serviceCharge: b.serviceCharge, cgst: b.cgst, sgst: b.sgst, roundOff: b.roundOff, grandTotal: b.grandTotal };
}

function toView(order: LoadedOrder, r: Restaurant): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    status: order.status,
    type: order.type,
    channel: (order.channel as "ZOMATO" | "SWIGGY" | null) ?? null,
    channelRef: order.channelRef,
    source: order.source,
    tableId: order.tableId,
    tableName: order.tableName,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    invoiceNumber: order.invoiceNumber,
    discount:
      order.discountType && order.discountValue
        ? { type: order.discountType as "PERCENT" | "FLAT", value: Number(order.discountValue), note: order.discountNote }
        : null,
    points: { redeemed: order.pointsRedeemed, value: toPaise(order.pointsRedeemValue), earned: order.pointsEarned },
    customer: order.customer,
    buyer: order.buyerGstin ? { gstin: order.buyerGstin, name: order.buyerName, address: order.buyerAddress } : null,
    createdAt: order.createdAt.toISOString(),
    kots: order.kots.map((k) => ({
      id: k.id,
      kotNumber: k.kotNumber,
      status: k.status,
      note: k.note,
      byCustomer: !k.createdById,
      createdAt: k.createdAt.toISOString(),
      items: k.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        name: i.name,
        variantName: i.variantName,
        addons: (i.addons as { name: string }[]).map((a) => a.name),
        foodType: i.foodType,
        quantity: i.quantity,
        unitPrice: toPaise(i.unitPrice),
        status: i.status,
        held: i.held,
        course: i.course,
        note: i.note,
        cancelReason: i.cancelReason,
      })),
    })),
    bill: billFor(order, r),
    paid: order.payments.reduce((s, p) => s + toPaise(p.amount), 0),
    payments: order.payments.map((p) => ({ id: p.id, method: p.method, amount: toPaise(p.amount), reference: p.reference, createdAt: p.createdAt.toISOString() })),
  };
}

export async function getOrderView(restaurant: Restaurant, orderId: string) {
  const order = await findOrder({ id: orderId, restaurantId: restaurant.id });
  return order ? toView(order, restaurant) : null;
}

export async function getPublicOrderView(publicToken: string) {
  const order = await findOrder({ publicToken });
  if (!order) return null;
  const restaurant = await db.restaurant.findUniqueOrThrow({ where: { id: order.restaurantId } });
  return { order: toView(order, restaurant), restaurant };
}
