import { describe, expect, it } from "vitest";
import { calculateBill } from "./gst";

describe("calculateBill", () => {
  it("adds 5% GST on top in exclusive mode", () => {
    const bill = calculateBill([{ unitPrice: 20000, quantity: 2, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
    });
    expect(bill.subtotal).toBe(40000);
    expect(bill.cgst).toBe(1000);
    expect(bill.sgst).toBe(1000);
    expect(bill.grandTotal).toBe(42000);
    expect(bill.roundOff).toBe(0);
  });

  it("extracts GST from the menu price in inclusive mode", () => {
    const bill = calculateBill([{ unitPrice: 10500, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "INCLUSIVE",
    });
    expect(bill.taxableValue).toBe(10000);
    expect(bill.totalTax).toBe(500);
    expect(bill.cgst + bill.sgst).toBe(500);
    expect(bill.grandTotal).toBe(10500);
  });

  it("keeps the customer-facing total equal to menu price in inclusive mode", () => {
    const bill = calculateBill(
      [
        { unitPrice: 9900, quantity: 3, gstRate: 5 },
        { unitPrice: 14900, quantity: 1, gstRate: 5 },
      ],
      { gstEnabled: true, mode: "INCLUSIVE" },
    );
    expect(bill.taxableValue + bill.totalTax).toBe(9900 * 3 + 14900);
  });

  it("splits odd tax paise between CGST and SGST without losing any", () => {
    const bill = calculateBill([{ unitPrice: 1010, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
    });
    // 5% of 10.10 = 0.505 -> 51 paise
    expect(bill.totalTax).toBe(51);
    expect(bill.cgst).toBe(25);
    expect(bill.sgst).toBe(26);
  });

  it("applies a percent discount before tax", () => {
    const bill = calculateBill([{ unitPrice: 100000, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
      discount: { type: "PERCENT", value: 10 },
    });
    expect(bill.discount).toBe(10000);
    expect(bill.taxableValue).toBe(90000);
    expect(bill.totalTax).toBe(4500);
    expect(bill.grandTotal).toBe(94500);
  });

  it("spreads a flat discount across lines proportionally and exactly", () => {
    const bill = calculateBill(
      [
        { unitPrice: 30000, quantity: 1, gstRate: 5 },
        { unitPrice: 10000, quantity: 1, gstRate: 18 },
      ],
      { gstEnabled: true, mode: "EXCLUSIVE", discount: { type: "FLAT", value: 10001 } },
    );
    expect(bill.discount).toBe(10001);
    expect(bill.lines[0].taxableValue + bill.lines[1].taxableValue).toBe(40000 - 10001);
    expect(bill.slabs.map((s) => s.gstRate)).toEqual([5, 18]);
  });

  it("never discounts more than the subtotal", () => {
    const bill = calculateBill([{ unitPrice: 5000, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
      discount: { type: "FLAT", value: 999999 },
    });
    expect(bill.discount).toBe(5000);
    expect(bill.grandTotal).toBe(0);
  });

  it("taxes the service charge at the line's GST rate", () => {
    const bill = calculateBill([{ unitPrice: 100000, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
      serviceChargeRate: 10,
    });
    expect(bill.serviceCharge).toBe(10000);
    expect(bill.taxableValue).toBe(110000);
    expect(bill.totalTax).toBe(5500);
    expect(bill.grandTotal).toBe(115500);
  });

  it("charges no tax when GST is disabled", () => {
    const bill = calculateBill([{ unitPrice: 12345, quantity: 1, gstRate: 5 }], {
      gstEnabled: false,
      mode: "EXCLUSIVE",
    });
    expect(bill.totalTax).toBe(0);
    expect(bill.grandTotal).toBe(12300);
    expect(bill.roundOff).toBe(-45);
  });

  it("rounds the grand total to the nearest rupee", () => {
    const bill = calculateBill([{ unitPrice: 15000, quantity: 1, gstRate: 5 }, { unitPrice: 1000, quantity: 1, gstRate: 5 }], {
      gstEnabled: true,
      mode: "EXCLUSIVE",
    });
    // 160 + 8 = 168.00 exactly
    expect(bill.grandTotal).toBe(16800);
    const odd = calculateBill([{ unitPrice: 9990, quantity: 1, gstRate: 5 }], { gstEnabled: true, mode: "EXCLUSIVE" });
    // 99.90 + 5.00 (4.995 rounded) = 104.90 -> 105
    expect(odd.grandTotal).toBe(10500);
    expect(odd.roundOff).toBe(10);
  });
});
