import { calculateBill, toPaise, type BillResult, type GstMode } from "./gst";

type Num = number | string | { toString(): string };

export interface BillableItem {
  unitPrice: Num;
  quantity: number;
  gstRate: Num;
  status: string;
}

/**
 * Bill for an order from its non-cancelled items, using the given tax settings. Loyalty points
 * (`redeemPaise`) are an extra flat discount applied after the order's own discount, before tax.
 */
export function orderBill(
  items: BillableItem[],
  settings: { gstEnabled: boolean; gstMode: GstMode; serviceChargeRate: Num },
  discount?: { type: string | null; value: Num | null },
  redeemPaise = 0,
): BillResult {
  const lines = items
    .filter((i) => i.status !== "CANCELLED")
    .map((i) => ({ unitPrice: toPaise(i.unitPrice), quantity: i.quantity, gstRate: Number(i.gstRate.toString()) }));
  const base = {
    gstEnabled: settings.gstEnabled,
    mode: settings.gstMode,
    serviceChargeRate: Number(settings.serviceChargeRate.toString()),
  };
  const dv = discount?.value ? Number(discount.value.toString()) : 0;
  const type: "PERCENT" | "FLAT" | null = discount?.type === "PERCENT" || discount?.type === "FLAT" ? discount.type : null;
  const own = dv > 0 && type ? { type, value: type === "FLAT" ? Math.round(dv * 100) : dv } : undefined;
  const bill = calculateBill(lines, { ...base, discount: own });
  if (redeemPaise <= 0) return bill;
  return calculateBill(lines, { ...base, discount: { type: "FLAT", value: bill.discount + redeemPaise } });
}

export const paiseToRupees = (paise: number) => (paise / 100).toFixed(2);
