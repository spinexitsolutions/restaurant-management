import "server-only";
import { db } from "@/lib/db";
import { menuToRows, SAMPLE_MENU } from "@/lib/menu-import";
import type { Range } from "@/server/reports";
import { menuAsRows } from "./menu-import";

type Cell = string | number | null | undefined;
const ist = (d: Date | null | undefined) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");
const num = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? "" : v.toString());

export const EXPORT_KINDS = {
  orders: { label: "Orders / invoices", dated: true },
  items: { label: "Items sold (line by line)", dated: true },
  payments: { label: "Payments", dated: true },
  customers: { label: "Customers", dated: false },
  menu: { label: "Menu (import format)", dated: false },
  stock: { label: "Stock movements", dated: true },
  attendance: { label: "Staff attendance", dated: true },
  "menu-template": { label: "Menu import template", dated: false },
} as const;
export type ExportKind = keyof typeof EXPORT_KINDS;

export function isExportKind(k: string): k is ExportKind {
  return k in EXPORT_KINDS;
}

/** Rows (header first) for one export. Everything is scoped to the restaurant. */
export async function exportRows(restaurantId: string, kind: ExportKind, range: Range): Promise<Cell[][]> {
  const created = { gte: range.start, lt: range.end };
  switch (kind) {
    case "orders": {
      const orders = await db.order.findMany({ where: { restaurantId, createdAt: created }, orderBy: { createdAt: "asc" }, include: { waiter: { select: { name: true } }, coupon: { select: { code: true } } } });
      return [
        ["Order No", "Invoice No", "Created", "Billed", "Status", "Type", "Channel", "Table", "Customer", "Mobile", "Buyer GSTIN", "Waiter", "Subtotal", "Discount", "Coupon", "Service charge", "CGST", "SGST", "Round off", "Total", "Cancel reason"],
        ...orders.map((o) => [
          o.orderNumber, o.invoiceNumber, ist(o.createdAt), ist(o.billedAt), o.status, o.type, o.channel, o.tableName, o.customerName, o.customerPhone, o.buyerGstin, o.waiter?.name,
          num(o.subtotal), num(o.discountAmount), o.coupon?.code, num(o.serviceCharge), num(o.cgst), num(o.sgst), num(o.roundOff), num(o.grandTotal), o.cancelReason,
        ]),
      ];
    }
    case "items": {
      const items = await db.orderItem.findMany({ where: { order: { restaurantId, createdAt: created } }, orderBy: { createdAt: "asc" }, include: { order: { select: { orderNumber: true, invoiceNumber: true, status: true } } } });
      return [
        ["Order No", "Invoice No", "Order status", "Time", "Item", "Variant", "Add-ons", "Qty", "Unit price", "GST %", "Line total", "Item status", "Note"],
        ...items.map((i) => [
          i.order.orderNumber, i.order.invoiceNumber, i.order.status, ist(i.createdAt), i.name, i.variantName, (i.addons as { name: string }[]).map((a) => a.name).join(", "),
          i.quantity, num(i.unitPrice), num(i.gstRate), (Number(i.unitPrice) * i.quantity).toFixed(2), i.status, i.note,
        ]),
      ];
    }
    case "payments": {
      const payments = await db.payment.findMany({ where: { order: { restaurantId }, createdAt: created }, orderBy: { createdAt: "asc" }, include: { order: { select: { orderNumber: true, invoiceNumber: true } } } });
      return [
        ["Time", "Order No", "Invoice No", "Method", "Amount", "Reference", "Razorpay payment"],
        ...payments.map((p) => [ist(p.createdAt), p.order.orderNumber, p.order.invoiceNumber, p.method, num(p.amount), p.reference, p.razorpayPaymentId]),
      ];
    }
    case "customers": {
      const customers = await db.customer.findMany({ where: { restaurantId }, orderBy: { createdAt: "asc" } });
      return [
        ["Mobile", "Name", "Visits", "Total spent", "Points", "Last visit", "Birthday (MM-DD)", "Anniversary (MM-DD)", "GSTIN", "Business name", "No marketing", "Notes", "Added"],
        ...customers.map((c) => [c.phone, c.name, c.visits, num(c.totalSpent), c.points, ist(c.lastVisitAt), c.birthday, c.anniversary, c.gstin, c.businessName, c.marketingOptOut ? "Yes" : "", c.notes, ist(c.createdAt)]),
      ];
    }
    case "menu":
      return menuToRows(await menuAsRows(restaurantId));
    case "menu-template":
      return menuToRows(SAMPLE_MENU);
    case "stock": {
      const moves = await db.stockMovement.findMany({ where: { restaurantId, createdAt: created }, orderBy: { createdAt: "asc" }, include: { ingredient: { select: { name: true, unit: true } } } });
      return [
        ["Time", "Ingredient", "Unit", "Type", "Quantity", "Unit cost", "Supplier", "Note"],
        ...moves.map((m) => [ist(m.createdAt), m.ingredient.name, m.ingredient.unit, m.type, num(m.quantity), num(m.unitCost), m.supplier, m.note]),
      ];
    }
    case "attendance": {
      const rows = await db.attendance.findMany({ where: { restaurantId, clockIn: created }, orderBy: { clockIn: "asc" }, include: { user: { select: { name: true, role: true } } } });
      return [
        ["Date", "Staff", "Role", "Clock in", "Clock out", "Hours", "Note"],
        ...rows.map((a) => [a.businessDate, a.user.name, a.user.role, ist(a.clockIn), ist(a.clockOut), a.clockOut ? ((a.clockOut.getTime() - a.clockIn.getTime()) / 3_600_000).toFixed(2) : "", a.note]),
      ];
    }
  }
}
