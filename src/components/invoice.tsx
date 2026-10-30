import type { Order, OrderItem, Payment, Restaurant } from "@prisma/client";
import { formatINR, toPaise } from "@/lib/gst";
import { orderBill } from "@/lib/order-bill";

type FullOrder = Order & { items: OrderItem[]; payments: Payment[] };

const SAC_RESTAURANT = "996331";

/** Receipt-style GST invoice; fits 80mm thermal paper and phone screens. */
export function Invoice({ order, restaurant }: { order: FullOrder; restaurant: Restaurant }) {
  const items = order.items.filter((i) => i.status !== "CANCELLED");
  // Recompute slabs from the frozen settings; totals match what was stored at billing.
  const bill = orderBill(
    items,
    { gstEnabled: order.gstEnabled ?? false, gstMode: order.gstMode ?? "EXCLUSIVE", serviceChargeRate: order.serviceChargeRate ?? 0 },
    { type: order.discountType, value: order.discountValue },
  );
  const taxInvoice = order.gstEnabled && restaurant.gstin;
  const date = (order.billedAt ?? order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto w-full max-w-[340px] bg-white p-4 font-mono text-[12px] leading-snug text-black">
      <div className="text-center">
        <p className="text-base font-bold">{restaurant.name}</p>
        {restaurant.address && <p>{restaurant.address}</p>}
        {(restaurant.city || restaurant.pincode) && <p>{[restaurant.city, restaurant.state, restaurant.pincode].filter(Boolean).join(", ")}</p>}
        {restaurant.phone && <p>Ph: {restaurant.phone}</p>}
        {taxInvoice && <p>GSTIN: {restaurant.gstin}</p>}
        {restaurant.fssaiNumber && <p>FSSAI: {restaurant.fssaiNumber}</p>}
        <p className="mt-2 border-y border-dashed border-black py-1 font-bold">{taxInvoice ? "TAX INVOICE" : "BILL"}</p>
      </div>

      <div className="my-2 space-y-0.5">
        <p className="flex justify-between">
          <span>Bill No: {order.invoiceNumber}</span>
        </p>
        <p>Date: {date}</p>
        <p>
          {order.tableName ? `Table: ${order.tableName}` : order.type === "DELIVERY" ? "Delivery" : "Takeaway"} · Order #{order.orderNumber}
        </p>
        {order.customerName && <p>Customer: {order.customerName}</p>}
        {order.customerPhone && <p>Mobile: {order.customerPhone}</p>}
      </div>

      <table className="w-full border-y border-dashed border-black">
        <thead>
          <tr className="border-b border-dashed border-black text-left">
            <th className="py-1 font-semibold">Item</th>
            <th className="py-1 text-right font-semibold">Qty</th>
            <th className="py-1 text-right font-semibold">Rate</th>
            <th className="py-1 text-right font-semibold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const addons = (i.addons as { name: string }[]).map((a) => a.name);
            return (
              <tr key={i.id} className="align-top">
                <td className="py-0.5 pr-1">
                  {i.name}
                  {i.variantName && ` (${i.variantName})`}
                  {addons.length > 0 && <span className="block text-[11px]">+ {addons.join(", ")}</span>}
                </td>
                <td className="py-0.5 text-right">{i.quantity}</td>
                <td className="py-0.5 text-right">{Number(i.unitPrice).toFixed(2)}</td>
                <td className="py-0.5 text-right">{(Number(i.unitPrice) * i.quantity).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="my-2 space-y-0.5">
        <Line label={order.gstMode === "INCLUSIVE" ? "Taxable value" : "Sub total"} value={toPaise(order.subtotal ?? 0)} />
        {toPaise(order.discountAmount ?? 0) > 0 && <Line label="Discount" value={-toPaise(order.discountAmount!)} />}
        {toPaise(order.serviceCharge ?? 0) > 0 && <Line label={`Service charge @${Number(order.serviceChargeRate)}%`} value={toPaise(order.serviceCharge!)} />}
        {bill.slabs
          .filter((s) => s.gstRate > 0)
          .map((s) => (
            <div key={s.gstRate}>
              <Line label={`CGST @${s.gstRate / 2}%`} value={s.cgst} />
              <Line label={`SGST @${s.gstRate / 2}%`} value={s.sgst} />
            </div>
          ))}
        {toPaise(order.roundOff ?? 0) !== 0 && <Line label="Round off" value={toPaise(order.roundOff!)} />}
      </dl>
      <p className="flex justify-between border-y border-dashed border-black py-1 text-sm font-bold">
        <span>GRAND TOTAL</span>
        <span>{formatINR(toPaise(order.grandTotal ?? 0))}</span>
      </p>

      {taxInvoice && (
        <p className="mt-1 text-[11px]">
          SAC {SAC_RESTAURANT} · Restaurant service{restaurant.state && ` · Place of supply: ${restaurant.state}`}
        </p>
      )}

      {order.payments.length > 0 && (
        <div className="mt-2">
          {order.payments.map((p) => (
            <p key={p.id} className="flex justify-between">
              <span>Paid by {p.method}</span>
              <span>{formatINR(toPaise(p.amount))}</span>
            </p>
          ))}
        </div>
      )}
      <p className="mt-3 text-center">Thank you! Visit again 🙏</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between">
      <span>{label}</span>
      <span>{(value / 100).toFixed(2)}</span>
    </p>
  );
}
