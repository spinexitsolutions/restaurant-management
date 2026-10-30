import { describe, expect, it } from "vitest";
import { buildSalesReport, toCsv, type ReportOrder } from "./reports";

const base: Omit<ReportOrder, "id" | "items" | "payments" | "billedAt"> = {
  invoiceNumber: null,
  tableName: "T1",
  type: "DINE_IN",
  waiterName: "Raju",
  gstEnabled: true,
  gstMode: "EXCLUSIVE",
  serviceChargeRate: 0,
  discountType: null,
  discountValue: null,
  subtotal: 0,
  discount: 0,
  serviceCharge: 0,
  cgst: 0,
  sgst: 0,
  roundOff: 0,
  grandTotal: 0,
};

describe("buildSalesReport", () => {
  const orders: ReportOrder[] = [
    {
      ...base,
      id: "a",
      billedAt: new Date("2026-10-30T08:00:00Z"), // 13:30 IST
      subtotal: 50000,
      cgst: 1250,
      sgst: 1250,
      grandTotal: 52500,
      items: [
        { name: "Dal", variantName: "Full", category: "Main", quantity: 1, unitPrice: 22000, gstRate: 5 },
        { name: "Naan", variantName: null, category: "Breads", quantity: 4, unitPrice: 7000, gstRate: 5 },
      ],
      payments: [
        { method: "UPI", amount: 30000 },
        { method: "CASH", amount: 22500 },
      ],
    },
    {
      ...base,
      id: "b",
      waiterName: null,
      billedAt: new Date("2026-10-30T08:20:00Z"), // 13:50 IST
      subtotal: 28000,
      cgst: 700,
      sgst: 700,
      grandTotal: 29400,
      items: [{ name: "Naan", variantName: null, category: "Breads", quantity: 4, unitPrice: 7000, gstRate: 5 }],
      payments: [{ method: "UPI", amount: 29400 }],
    },
  ];
  const r = buildSalesReport(orders);

  it("totals bills", () => {
    expect(r.bills).toBe(2);
    expect(r.total).toBe(81900);
    expect(r.averageBill).toBe(40950);
  });
  it("groups payments by method", () => {
    expect(r.payments).toEqual([
      { method: "UPI", amount: 59400, count: 2 },
      { method: "CASH", amount: 22500, count: 1 },
    ]);
  });
  it("ranks items and categories by amount", () => {
    expect(r.items[0]).toEqual({ name: "Naan", category: "Breads", quantity: 8, amount: 56000 });
    expect(r.categories.map((c) => c.category)).toEqual(["Breads", "Main"]);
  });
  it("buckets bills by IST hour", () => {
    expect(r.hours).toEqual([{ hour: 13, bills: 2, amount: 81900 }]);
  });
  it("builds the GST slab summary", () => {
    expect(r.gstSlabs).toEqual([{ gstRate: 5, taxableValue: 78000, cgst: 1950, sgst: 1950 }]);
  });
  it("labels bills without a waiter", () => {
    expect(r.staff.map((s) => s.name).sort()).toEqual(["Customer QR / unassigned", "Raju"]);
  });
});

describe("toCsv", () => {
  it("escapes commas, quotes and formula-like text", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", -5]])).toBe('"a,b","say ""hi""",\'=SUM(A1),-5');
  });
});
