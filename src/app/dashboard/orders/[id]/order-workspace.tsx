"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, ChefHat, MessageCircle, Minus, Plus, Printer, X } from "lucide-react";
import { Badge, Button, FoodTypeIcon, Input, Select } from "@/components/ui";
import { MenuPicker, type PickerCategory } from "@/components/menu-picker";
import { addToCart, lineLabel, setQuantity, type CartLine } from "@/lib/cart";
import { formatINR } from "@/lib/gst";
import { buildUpiLink } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { useLiveRefresh } from "@/hooks/use-live";
import type { OrderItemView, OrderView } from "@/server/order-view";
import {
  acceptKot,
  applyDiscount,
  billOrder,
  cancelOrderItem,
  cancelWholeOrder,
  markServed,
  rejectKot,
  reopenOrder,
  sendKot,
  takePayment,
  type ActionResult,
} from "../actions";

export interface WorkspaceRestaurant {
  name: string;
  upiId: string | null;
  upiPayeeName: string | null;
  acceptCash: boolean;
  acceptCard: boolean;
  gstMode: "INCLUSIVE" | "EXCLUSIVE";
}

const ITEM_STATUS: Record<OrderItemView["status"], { label: string; tone: "stone" | "amber" | "green" | "brand" | "red" }> = {
  NEW: { label: "New", tone: "stone" },
  PREPARING: { label: "Preparing", tone: "amber" },
  READY: { label: "Ready", tone: "green" },
  SERVED: { label: "Served", tone: "brand" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

export function OrderWorkspace(props: {
  order: OrderView | null;
  context: { tableId: string | null; tableName: string | null; type: "DINE_IN" | "TAKEAWAY" | "DELIVERY" };
  menu: PickerCategory[];
  restaurant: WorkspaceRestaurant;
  canBill: boolean;
}) {
  const { order, context, menu, restaurant, canBill } = props;
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [kotNote, setKotNote] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"menu" | "order">("menu");
  useLiveRefresh();

  const status = order?.status ?? "OPEN";
  const editable = status === "OPEN";
  const title = context.tableName ? `Table ${context.tableName}` : order ? `${order.type === "DELIVERY" ? "Delivery" : "Takeaway"} #${order.orderNumber}` : "New takeaway";

  function act<T>(fn: () => Promise<ActionResult<T>>, after?: (data: T | undefined) => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else after?.(res.data);
    });
  }

  function send() {
    act(
      () =>
        sendKot({
          orderId: order?.id,
          tableId: context.tableId,
          type: context.type,
          customerName: customer.name || undefined,
          customerPhone: customer.phone || undefined,
          note: kotNote || undefined,
          lines: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId, addonIds: l.addonIds, quantity: l.quantity })),
        }),
      (data) => {
        setCart([]);
        setKotNote("");
        if (!order && data) router.replace(`/dashboard/orders/${data.orderId}`);
      },
    );
  }

  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const itemCount = order?.kots.flatMap((k) => k.items).filter((i) => i.status !== "CANCELLED").length ?? 0;

  return (
    <div className="-m-4 flex h-[calc(100dvh-57px)] flex-col sm:-m-6 lg:-m-8 lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link href={canBill ? "/dashboard/pos" : "/dashboard/waiter"} className="rounded-lg p-1.5 hover:bg-stone-100" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{title}</h1>
          <p className="text-xs text-stone-500">
            {order ? `Order #${order.orderNumber}` : "New order"}
            {order?.customerName && ` · ${order.customerName}`}
            {order?.invoiceNumber && ` · ${order.invoiceNumber}`}
          </p>
        </div>
        <Badge tone={status === "PAID" ? "green" : status === "BILLED" ? "amber" : status === "CANCELLED" ? "red" : "stone"}>{status}</Badge>
      </header>

      <div className="flex border-b border-stone-200 bg-white lg:hidden">
        {(["menu", "order"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 py-2 text-sm font-medium", tab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-stone-500")}>
            {t === "menu" ? "Menu" : `Order (${itemCount + cart.length})`}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {editable && (
          <section className={cn("min-h-0 flex-1 bg-stone-50 p-4", tab === "order" && "hidden lg:block")}>
            <MenuPicker
              categories={menu}
              onAdd={(line) => {
                setCart((c) => addToCart(c, line));
              }}
            />
          </section>
        )}

        <aside className={cn("flex min-h-0 w-full flex-col border-l border-stone-200 bg-white lg:w-[420px]", editable && tab === "menu" && "hidden lg:flex", !editable && "lg:mx-auto lg:border-r")}>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {order?.kots.map((kot) => (
              <KotBlock key={kot.id} kot={kot} editable={editable} onAct={act} />
            ))}

            {editable && cart.length > 0 && (
              <div className="rounded-lg border-2 border-dashed border-brand-500/50 p-3">
                <p className="mb-2 text-xs font-semibold tracking-wide text-brand-700 uppercase">New items</p>
                <ul className="space-y-2">
                  {cart.map((l) => (
                    <li key={l.key} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1">{lineLabel(l)}</span>
                      <div className="flex items-center rounded-lg ring-1 ring-stone-200">
                        <button className="p-1.5" onClick={() => setCart((c) => setQuantity(c, l.key, l.quantity - 1))} aria-label="Decrease">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-semibold">{l.quantity}</span>
                        <button className="p-1.5" onClick={() => setCart((c) => setQuantity(c, l.key, l.quantity + 1))} aria-label="Increase">
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="w-16 text-right">{formatINR(l.unitPrice * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <Input className="mt-3" placeholder="Kitchen note (e.g. less spicy)" value={kotNote} onChange={(e) => setKotNote(e.target.value)} maxLength={200} />
                {!order && !context.tableId && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                    <Input placeholder="Mobile" inputMode="numeric" maxLength={10} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {!order && cart.length === 0 && <p className="py-10 text-center text-sm text-stone-500">Tap items on the menu to start the order.</p>}

            {order && order.bill.subtotal > 0 && <BillBox order={order} restaurant={restaurant} />}

            {order && canBill && (
              <BillingPanel order={order} restaurant={restaurant} pending={pending} onAct={act} />
            )}
          </div>

          {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {editable && cart.length > 0 && (
            <div className="border-t border-stone-200 p-3">
              <Button className="h-12 w-full text-base" disabled={pending} onClick={send}>
                <ChefHat size={18} /> {pending ? "Sending..." : `Send to kitchen · ${formatINR(cartTotal)}`}
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function KotBlock({
  kot,
  editable,
  onAct,
}: {
  kot: OrderView["kots"][number];
  editable: boolean;
  onAct: <T>(fn: () => Promise<ActionResult<T>>, after?: (d: T | undefined) => void) => void;
}) {
  const ready = kot.items.filter((i) => i.status === "READY");
  const pendingApproval = kot.status === "PENDING_APPROVAL";
  return (
    <div className={cn("rounded-lg ring-1", pendingApproval ? "bg-amber-50 ring-amber-300" : kot.status === "REJECTED" ? "opacity-50 ring-stone-200" : "ring-stone-200")}>
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-xs text-stone-500">
        <span className="font-semibold text-stone-700">
          KOT #{kot.kotNumber} {kot.byCustomer && <span className="font-normal text-amber-700">· from customer QR</span>}
        </span>
        <span>{new Date(kot.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <ul className="divide-y divide-stone-100">
        {kot.items.map((item) => (
          <li key={item.id} className={cn("flex items-start gap-2 px-3 py-2 text-sm", item.status === "CANCELLED" && "text-stone-400 line-through")}>
            <span className="mt-0.5">
              <FoodTypeIcon type={item.foodType} />
            </span>
            <div className="min-w-0 flex-1">
              <p>
                {item.quantity} × {item.name}
                {item.variantName && ` (${item.variantName})`}
              </p>
              {item.addons.length > 0 && <p className="text-xs text-stone-500">+ {item.addons.join(", ")}</p>}
              {item.cancelReason && <p className="text-xs text-red-600 no-underline">{item.cancelReason}</p>}
            </div>
            {!pendingApproval && kot.status === "ACCEPTED" && <Badge tone={ITEM_STATUS[item.status].tone}>{ITEM_STATUS[item.status].label}</Badge>}
            <span className="w-16 text-right">{formatINR(item.unitPrice * item.quantity)}</span>
            {editable && kot.status === "ACCEPTED" && item.status !== "CANCELLED" && item.status !== "SERVED" && (
              <button
                className="rounded p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                title="Cancel item"
                onClick={() => {
                  const reason = item.status === "NEW" ? prompt("Reason (optional)") ?? null : prompt("Reason for cancelling (required)");
                  if (reason !== null) onAct(() => cancelOrderItem(item.id, reason));
                }}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {kot.note && <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-600">Note: {kot.note}</p>}
      {pendingApproval && (
        <div className="flex gap-2 border-t border-amber-200 p-2">
          <Button size="sm" className="flex-1" onClick={() => onAct(() => acceptKot(kot.id))}>
            <Check size={14} /> Accept & send to kitchen
          </Button>
          <Button size="sm" variant="secondary" onClick={() => confirm("Reject this customer order?") && onAct(() => rejectKot(kot.id))}>
            Reject
          </Button>
        </div>
      )}
      {ready.length > 0 && (
        <div className="border-t border-stone-100 p-2">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => onAct(() => markServed(ready.map((i) => i.id)))}>
            Mark {ready.length} ready item{ready.length > 1 ? "s" : ""} served
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "text-base font-semibold")}>
      <dt className={bold ? "" : "text-stone-600"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BillBox({ order, restaurant }: { order: OrderView; restaurant: WorkspaceRestaurant }) {
  const b = order.bill;
  return (
    <dl className="space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
      <Row label={restaurant.gstMode === "INCLUSIVE" ? "Taxable value" : "Subtotal"} value={formatINR(b.subtotal)} />
      {b.discount > 0 && (
        <Row label={`Discount${order.discount?.type === "PERCENT" ? ` (${order.discount.value}%)` : ""}`} value={`- ${formatINR(b.discount)}`} />
      )}
      {b.serviceCharge > 0 && <Row label="Service charge" value={formatINR(b.serviceCharge)} />}
      {b.cgst + b.sgst > 0 && (
        <>
          <Row label="CGST" value={formatINR(b.cgst)} />
          <Row label="SGST" value={formatINR(b.sgst)} />
        </>
      )}
      {b.roundOff !== 0 && <Row label="Round off" value={formatINR(b.roundOff)} />}
      <div className="border-t border-stone-200 pt-1">
        <Row label="Total" value={formatINR(b.grandTotal)} bold />
      </div>
      {order.paid > 0 && <Row label="Paid" value={formatINR(order.paid)} />}
    </dl>
  );
}

function BillingPanel({
  order,
  restaurant,
  pending,
  onAct,
}: {
  order: OrderView;
  restaurant: WorkspaceRestaurant;
  pending: boolean;
  onAct: <T>(fn: () => Promise<ActionResult<T>>, after?: (d: T | undefined) => void) => void;
}) {
  const due = order.bill.grandTotal - order.paid;
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">(order.discount?.type ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(order.discount ? String(order.discount.value) : "");
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "OTHER">(restaurant.upiId ? "UPI" : "CASH");
  const [amount, setAmount] = useState((due / 100).toFixed(2));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [upiQr, setUpiQr] = useState<string | null>(null);

  useEffect(() => setAmount((due / 100).toFixed(2)), [due]);
  useEffect(() => {
    if (order.status !== "BILLED" || method !== "UPI" || !restaurant.upiId) return setUpiQr(null);
    const link = buildUpiLink({
      upiId: restaurant.upiId,
      payeeName: restaurant.upiPayeeName || restaurant.name,
      amountPaise: Math.round(Number(amount) * 100) || due,
      note: order.invoiceNumber ?? `Order ${order.orderNumber}`,
    });
    QRCode.toDataURL(link, { width: 220, margin: 1 }).then(setUpiQr);
  }, [order.status, order.invoiceNumber, order.orderNumber, method, amount, due, restaurant]);

  const change = method === "CASH" && tendered ? Math.round(Number(tendered) * 100) - Math.round(Number(amount) * 100) : 0;
  const shareText = `Thank you for dining at ${restaurant.name}! Your bill: ${typeof window !== "undefined" ? window.location.origin : ""}/i/${order.publicToken}`;

  if (order.status === "OPEN") {
    return (
      <div className="space-y-3 rounded-lg ring-1 ring-stone-200 p-3">
        <p className="text-sm font-semibold">Discount</p>
        <div className="flex gap-2">
          <Select className="w-24" value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FLAT")}>
            <option value="PERCENT">%</option>
            <option value="FLAT">₹</option>
          </Select>
          <Input type="number" min={0} placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onAct(() => applyDiscount(order.id, discountType, Number(discountValue) || 0, ""))}
          >
            Apply
          </Button>
        </div>
        <Button className="h-11 w-full" disabled={pending} onClick={() => onAct(() => billOrder(order.id))}>
          <Printer size={16} /> Generate bill
        </Button>
        <button
          className="w-full text-center text-xs text-red-600 hover:underline"
          onClick={() => {
            const reason = prompt("Reason for cancelling the whole order");
            if (reason) onAct(() => cancelWholeOrder(order.id, reason));
          }}
        >
          Cancel order
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg p-3 ring-1 ring-stone-200">
      <div className="flex gap-2">
        <Link href={`/dashboard/orders/${order.id}/invoice`} target="_blank" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
          <Printer size={16} /> Print bill
        </Link>
        <a
          href={`https://wa.me/${order.customerPhone ? `91${order.customerPhone}` : ""}?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-medium text-white"
        >
          <MessageCircle size={16} /> WhatsApp bill
        </a>
      </div>

      {order.status === "PAID" ? (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p className="font-semibold">Paid in full</p>
          {order.payments.map((p, i) => (
            <p key={i}>
              {p.method}: {formatINR(p.amount)} {p.reference && `(${p.reference})`}
            </p>
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold">Collect payment · {formatINR(due)} due</p>
          <div className="grid grid-cols-4 gap-1">
            {(["CASH", "UPI", "CARD", "OTHER"] as const)
              .filter((m) => (m === "CASH" ? restaurant.acceptCash : m === "CARD" ? restaurant.acceptCard : true))
              .map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn("rounded-lg py-2 text-xs font-semibold", method === m ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700")}
                >
                  {m}
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-stone-500">
              Amount
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            {method === "CASH" ? (
              <label className="text-xs text-stone-500">
                Cash received
                <Input type="number" min={0} step="1" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={amount} />
              </label>
            ) : (
              <label className="text-xs text-stone-500">
                Reference (optional)
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "UPI" ? "UTR / last 4" : "Txn no."} />
              </label>
            )}
          </div>
          {change > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Return change: {formatINR(change)}</p>}
          {upiQr && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upiQr} alt="UPI QR" className="mx-auto h-44 w-44" />
              <p className="text-xs text-stone-500">Customer scans to pay {formatINR(Math.round(Number(amount) * 100))}. Confirm after you receive it.</p>
            </div>
          )}
          <Button
            className="h-11 w-full"
            disabled={pending || !(Number(amount) > 0)}
            onClick={() => onAct(() => takePayment(order.id, { method, amount: Number(amount), reference: reference || undefined }), () => setTendered(""))}
          >
            {method === "UPI" ? "Payment received" : "Record payment"} · {formatINR(Math.round(Number(amount) * 100) || 0)}
          </Button>
          {order.paid === 0 && (
            <button className="w-full text-center text-xs text-stone-500 hover:underline" onClick={() => onAct(() => reopenOrder(order.id))}>
              Reopen bill to add or change items
            </button>
          )}
        </>
      )}
    </div>
  );
}
