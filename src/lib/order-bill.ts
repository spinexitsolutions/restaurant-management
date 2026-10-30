import { calculateBill, toPaise, type BillResult, type GstMode } from "./gst";

type Num = number | string | { toString(): string };

export interface BillableItem {
  unitPrice: Num;
  quantity: number;
  gstRate: Num;
  status: string;
}

/** Bill for an order from its non-cancelled items, using the given tax settings. */
export function orderBill(
  items: BillableItem[],
  settings: { gstEnabled: boolean; gstMode: GstMode; serviceChargeRate: Num },
  discount?: { type: string | null; value: Num | null },
): BillResult {
  const lines = items
    .filter((i) => i.status !== "CANCELLED")
    .map((i) => ({ unitPrice: toPaise(i.unitPrice), quantity: i.quantity, gstRate: Number(i.gstRate.toString()) }));
  const dv = discount?.value ? Number(discount.value.toString()) : 0;
  return calculateBill(lines, {
    gstEnabled: settings.gstEnabled,
    mode: settings.gstMode,
    serviceChargeRate: Number(settings.serviceChargeRate.toString()),
    discount:
      dv > 0 && (discount?.type === "PERCENT" || discount?.type === "FLAT")
        ? { type: discount.type, value: discount.type === "FLAT" ? Math.round(dv * 100) : dv }
        : undefined,
  });
}

export const paiseToRupees = (paise: number) => (paise / 100).toFixed(2);
