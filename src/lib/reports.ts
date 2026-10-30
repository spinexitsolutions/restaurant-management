// Pure aggregation for sales reports. Inputs are plain objects (paise for money) so this is easy to test.

import type { GstMode } from "./gst";
import { orderBill } from "./order-bill";

export interface ReportOrder {
  id: string;
  invoiceNumber: string | null;
  billedAt: Date;
  tableName: string | null;
  type: string;
  waiterName: string | null;
  gstEnabled: boolean;
  gstMode: GstMode;
  serviceChargeRate: number;
  discountType: string | null;
  discountValue: number | null; // percent, or rupees for FLAT
  pointsValue: number; // paise of loyalty points redeemed
  subtotal: number;
  discount: number;
  serviceCharge: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
  items: { name: string; variantName: string | null; category: string; quantity: number; unitPrice: number; gstRate: number }[];
  payments: { method: string; amount: number }[];
}

export interface SalesReport {
  bills: number;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  total: number;
  averageBill: number;
  payments: { method: string; amount: number; count: number }[];
  items: { name: string; category: string; quantity: number; amount: number }[];
  categories: { category: string; quantity: number; amount: number }[];
  hours: { hour: number; bills: number; amount: number }[];
  staff: { name: string; bills: number; amount: number }[];
  gstSlabs: { gstRate: number; taxableValue: number; cgst: number; sgst: number }[];
}

function istHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(d));
}

function bump<T extends object>(map: Map<string, T>, key: string, init: () => T, fn: (v: T) => void) {
  const v = map.get(key) ?? init();
  fn(v);
  map.set(key, v);
}

export function buildSalesReport(orders: ReportOrder[]): SalesReport {
  const sum = (f: (o: ReportOrder) => number) => orders.reduce((s, o) => s + f(o), 0);
  const payments = new Map<string, { method: string; amount: number; count: number }>();
  const items = new Map<string, { name: string; category: string; quantity: number; amount: number }>();
  const categories = new Map<string, { category: string; quantity: number; amount: number }>();
  const staff = new Map<string, { name: string; bills: number; amount: number }>();
  const slabs = new Map<string, { gstRate: number; taxableValue: number; cgst: number; sgst: number }>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, bills: 0, amount: 0 }));

  for (const o of orders) {
    for (const p of o.payments) bump(payments, p.method, () => ({ method: p.method, amount: 0, count: 0 }), (v) => ((v.amount += p.amount), v.count++));
    for (const i of o.items) {
      const name = i.variantName ? `${i.name} (${i.variantName})` : i.name;
      const amount = i.unitPrice * i.quantity;
      bump(items, name, () => ({ name, category: i.category, quantity: 0, amount: 0 }), (v) => ((v.quantity += i.quantity), (v.amount += amount)));
      bump(categories, i.category, () => ({ category: i.category, quantity: 0, amount: 0 }), (v) => ((v.quantity += i.quantity), (v.amount += amount)));
    }
    const h = hours[istHour(o.billedAt)];
    h.bills++;
    h.amount += o.grandTotal;
    const waiter = o.waiterName ?? "Customer QR / unassigned";
    bump(staff, waiter, () => ({ name: waiter, bills: 0, amount: 0 }), (v) => (v.bills++, (v.amount += o.grandTotal)));

    // Rate-wise GST split, recomputed with the settings frozen on the bill.
    const bill = orderBill(
      o.items.map((i) => ({ unitPrice: i.unitPrice / 100, quantity: i.quantity, gstRate: i.gstRate, status: "SERVED" })),
      { gstEnabled: o.gstEnabled, gstMode: o.gstMode, serviceChargeRate: o.serviceChargeRate },
      { type: o.discountType, value: o.discountValue },
      o.pointsValue,
    );
    for (const sl of bill.slabs) {
      bump(slabs, String(sl.gstRate), () => ({ gstRate: sl.gstRate, taxableValue: 0, cgst: 0, sgst: 0 }), (v) => {
        v.taxableValue += sl.taxableValue;
        v.cgst += sl.cgst;
        v.sgst += sl.sgst;
      });
    }
  }

  const total = sum((o) => o.grandTotal);
  return {
    bills: orders.length,
    subtotal: sum((o) => o.subtotal),
    discount: sum((o) => o.discount),
    serviceCharge: sum((o) => o.serviceCharge),
    cgst: sum((o) => o.cgst),
    sgst: sum((o) => o.sgst),
    roundOff: sum((o) => o.roundOff),
    total,
    averageBill: orders.length ? Math.round(total / orders.length) : 0,
    payments: [...payments.values()].sort((a, b) => b.amount - a.amount),
    items: [...items.values()].sort((a, b) => b.amount - a.amount),
    categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
    hours: hours.filter((h) => h.bills > 0),
    staff: [...staff.values()].sort((a, b) => b.amount - a.amount),
    gstSlabs: [...slabs.values()].sort((a, b) => a.gstRate - b.gstRate),
  };
}

/** CSV cell escaping (quotes, commas, newlines) plus a guard against spreadsheet formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
