// GST bill calculation. All amounts are integer paise to avoid floating point errors.
//
// Order of operations (standard Indian restaurant billing):
//   1. line amount = unit price x qty
//   2. INCLUSIVE mode: tax is extracted from the line amount; EXCLUSIVE: line amount is the taxable value
//   3. bill-level discount is spread across lines in proportion to their taxable value
//   4. service charge is applied on the discounted taxable value and taxed at the same rate as the line
//   5. tax is split equally into CGST + SGST (intra-state supply)
//   6. grand total is rounded to the nearest rupee and the difference shown as round-off

export type GstMode = "INCLUSIVE" | "EXCLUSIVE";

export interface BillLineInput {
  unitPrice: number; // paise
  quantity: number;
  gstRate: number; // percent, e.g. 5
}

export interface BillOptions {
  gstEnabled: boolean;
  mode: GstMode;
  discount?: { type: "PERCENT" | "FLAT"; value: number }; // FLAT value in paise
  serviceChargeRate?: number; // percent
}

export interface BillLineResult {
  grossAmount: number; // unitPrice x qty as entered on the menu
  taxableValue: number; // after discount, before service charge
  serviceCharge: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface TaxSlab {
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
}

export interface BillResult {
  lines: BillLineResult[];
  subtotal: number; // taxable value before discount
  discount: number;
  serviceCharge: number;
  taxableValue: number; // after discount, including service charge
  cgst: number;
  sgst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  slabs: TaxSlab[];
}

const round = (n: number) => Math.round(n);

export function toPaise(rupees: number | string | { toString(): string }): number {
  return Math.round(parseFloat(rupees.toString()) * 100);
}

export function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

/** Splits a total into parts proportional to weights; parts always sum exactly to total. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  // Hand the leftover paise to the largest weights first.
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) parts[order[k]]++;
  return parts;
}

function splitTax(tax: number): { cgst: number; sgst: number } {
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst };
}

export function calculateBill(items: BillLineInput[], options: BillOptions): BillResult {
  const { gstEnabled, mode } = options;
  const serviceChargeRate = options.serviceChargeRate ?? 0;

  const lines = items.map((item) => {
    const gross = round(item.unitPrice * item.quantity);
    const rate = gstEnabled ? item.gstRate : 0;
    const baseTaxable = mode === "INCLUSIVE" && rate > 0 ? round((gross * 100) / (100 + rate)) : gross;
    return { gross, rate, baseTaxable };
  });

  const subtotal = lines.reduce((s, l) => s + l.baseTaxable, 0);

  let discount = 0;
  if (options.discount && options.discount.value > 0) {
    discount =
      options.discount.type === "PERCENT"
        ? round((subtotal * Math.min(options.discount.value, 100)) / 100)
        : round(options.discount.value);
    discount = Math.min(discount, subtotal);
  }
  const lineDiscounts = allocate(
    discount,
    lines.map((l) => l.baseTaxable),
  );

  const lineResults: BillLineResult[] = lines.map((l, i) => {
    const taxableValue = l.baseTaxable - lineDiscounts[i];
    const serviceCharge = round((taxableValue * serviceChargeRate) / 100);
    let tax: number;
    if (mode === "INCLUSIVE" && discount === 0 && serviceCharge === 0) {
      // Keep the menu price intact: tax is whatever remains after extracting the taxable value.
      tax = l.gross - l.baseTaxable;
    } else {
      tax = round(((taxableValue + serviceCharge) * l.rate) / 100);
    }
    const { cgst, sgst } = splitTax(tax);
    return {
      grossAmount: l.gross,
      taxableValue,
      serviceCharge,
      gstRate: l.rate,
      cgst,
      sgst,
      total: taxableValue + serviceCharge + tax,
    };
  });

  const slabMap = new Map<number, TaxSlab>();
  for (const l of lineResults) {
    const slab = slabMap.get(l.gstRate) ?? { gstRate: l.gstRate, taxableValue: 0, cgst: 0, sgst: 0 };
    slab.taxableValue += l.taxableValue + l.serviceCharge;
    slab.cgst += l.cgst;
    slab.sgst += l.sgst;
    slabMap.set(l.gstRate, slab);
  }

  const serviceCharge = lineResults.reduce((s, l) => s + l.serviceCharge, 0);
  const cgst = lineResults.reduce((s, l) => s + l.cgst, 0);
  const sgst = lineResults.reduce((s, l) => s + l.sgst, 0);
  const taxableValue = subtotal - discount + serviceCharge;
  const exact = taxableValue + cgst + sgst;
  const grandTotal = Math.round(exact / 100) * 100;

  return {
    lines: lineResults,
    subtotal,
    discount,
    serviceCharge,
    taxableValue,
    cgst,
    sgst,
    totalTax: cgst + sgst,
    roundOff: grandTotal - exact,
    grandTotal,
    slabs: [...slabMap.values()].sort((a, b) => a.gstRate - b.gstRate),
  };
}
