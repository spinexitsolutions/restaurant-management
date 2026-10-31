"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { ArrowLeft, ArrowRightLeft, Check, ChefHat, Combine, MessageCircle, Minus, Plus, Printer, Split, X } from "lucide-react";
import { Badge, Button, FoodTypeIcon, Input, Select } from "@/components/ui";
import { MenuPicker, type PickerCategory } from "@/components/menu-picker";
import { PinDialog } from "@/components/pin-dialog";
import { enqueue, newRequestId } from "@/lib/outbox";
import { COURSES, nextCourse } from "@/lib/courses";
import { useSoundbox } from "@/hooks/use-soundbox";
import { addToCart, lineLabel, setQuantity, type CartLine } from "@/lib/cart";
import { formatINR } from "@/lib/gst";
import { buildUpiLink } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { useLiveRefresh } from "@/hooks/use-live";
import { useT } from "@/components/i18n";
import type { OrderItemView, OrderView } from "@/server/order-view";
import {
  acceptKot,
  applyCoupon,
  applyDiscount,
  applyPoints,
  fireCourse,
  billOrder,
  cancelOrderItem,
  cancelWholeOrder,
  markServed,
  mergeInto,
  checkUpiQr,
  rejectKot,
  reopenOrder,
  showUpiQr,
  reprintOrder,
  sendKot,
  setBuyer,
  setCustomer,
  splitBill,
  takePayment,
  transferTable,
  type ActionResult,
} from "../actions";

export interface WorkspaceRestaurant {
  razorpay: boolean; // dynamic UPI QR that confirms itself
  loyalty: { enabled: boolean; pointValue: number; minRedeem: number };
  name: string;
  upiId: string | null;
  upiPayeeName: string | null;
  acceptCash: boolean;
  acceptCard: boolean;
  gstMode: "INCLUSIVE" | "EXCLUSIVE";
}

const ITEM_TONE: Record<OrderItemView["status"], "stone" | "amber" | "green" | "brand" | "red"> = {
  NEW: "stone",
  PREPARING: "amber",
  READY: "green",
  SERVED: "brand",
  CANCELLED: "red",
};

export interface FloorTableOption {
  id: string;
  name: string;
  orderId: string | null;
  orderNumber: number | null;
  orderStatus: string | null;
}

type Act = <T>(fn: (pin?: string) => Promise<ActionResult<T>>, after?: (data: T | undefined) => void) => void;

export function OrderWorkspace(props: {
  floorTables: FloorTableOption[];
  order: OrderView | null;
  context: { tableId: string | null; tableName: string | null; type: "DINE_IN" | "TAKEAWAY" | "DELIVERY"; channel: "ZOMATO" | "SWIGGY" | null };
  menu: PickerCategory[];
  restaurant: WorkspaceRestaurant;
  canBill: boolean;
}) {
  const { order, context, menu, restaurant, canBill, floorTables } = props;
  const t = useT();
  const [pinRequest, setPinRequest] = useState<{ retry: (pin: string) => void; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [kotNote, setKotNote] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [channelRef, setChannelRef] = useState("");
  const channelName = context.channel === "ZOMATO" ? "Zomato" : context.channel === "SWIGGY" ? "Swiggy" : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"menu" | "order">("menu");
  useLiveRefresh();

  const status = order?.status ?? "OPEN";
  const editable = status === "OPEN";
  const title = context.tableName
    ? t("floor.table", { name: context.tableName })
    : channelName
      ? `${channelName} ${order?.channelRef ? `#${order.channelRef}` : order ? `· order ${order.orderNumber}` : "order"}`
      : order
        ? `${order.type === "DELIVERY" ? t("floor.delivery") : t("floor.takeaway")} #${order.orderNumber}`
        : context.type === "DELIVERY"
          ? "New delivery"
          : "New takeaway";

  // Runs an action; if the server asks for a manager PIN, shows the PIN dialog and retries with it.
  const act: Act = (fn, after) => {
    setError(null);
    const attempt = (pin?: string) =>
      start(async () => {
        const res = await fn(pin);
        if (!res.ok && res.error === "PIN_REQUIRED") return setPinRequest({ retry: attempt, error: null });
        if (!res.ok && pin) return setPinRequest({ retry: attempt, error: res.error });
        setPinRequest(null);
        if (!res.ok) setError(res.error);
        else after?.(res.data);
      });
    attempt();
  };

  function send() {
    const payload = {
      orderId: order?.id,
      tableId: context.tableId,
      type: context.type,
      customerName: customer.name || undefined,
      customerPhone: customer.phone || undefined,
      channel: context.channel,
      channelRef: channelRef || undefined,
      note: kotNote || undefined,
      lines: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId, addonIds: l.addonIds, quantity: l.quantity })),
      clientRequestId: newRequestId(),
    };
    const clear = () => {
      setCart([]);
      setKotNote("");
    };
    const queue = () => {
      enqueue({ id: payload.clientRequestId, kind: "sendKot", label: `KOT for ${title}`, createdAt: Date.now(), payload });
      clear();
      setNotice("You're offline. This KOT is saved on this device and will reach the kitchen as soon as the internet is back.");
    };
    setError(null);
    setNotice(null);
    if (!navigator.onLine) return queue();
    start(async () => {
      try {
        const res = await sendKot(payload);
        if (!res.ok) return setError(res.error);
        clear();
        if (!order && res.data) router.replace(`/dashboard/orders/${res.data.orderId}`);
      } catch {
        queue();
      }
    });
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
            {order ? t("order.number", { number: order.orderNumber }) : t("order.new")}
            {order?.customerName && ` · ${order.customerName}`}
            {order?.invoiceNumber && ` · ${order.invoiceNumber}`}
          </p>
        </div>
        {order && order.kots.some((k) => k.status === "ACCEPTED") && (
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50"
            title="Print KOTs again"
            disabled={pending}
            onClick={() => act(() => reprintOrder(order.id, "KOT"), () => setNotice("KOT sent to the kitchen printer again."))}
          >
            <Printer size={14} /> <span className="hidden sm:inline">KOT</span>
          </button>
        )}
        {order && (status === "BILLED" || status === "PAID") && (
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50"
            title="Print the bill on the thermal printer"
            disabled={pending}
            onClick={() => act(() => reprintOrder(order.id, "BILL"), () => setNotice("Bill sent to the printer."))}
          >
            <Printer size={14} /> <span className="hidden sm:inline">Bill</span>
          </button>
        )}
        {order && (status === "OPEN" || status === "BILLED") && (
          <TableActions order={order} floorTables={floorTables} canBill={canBill} onAct={act} />
        )}
        <Badge tone={status === "PAID" ? "green" : status === "BILLED" ? "amber" : status === "CANCELLED" ? "red" : "stone"}>{status}</Badge>
      </header>
      {pinRequest && <PinDialog error={pinRequest.error} onCancel={() => setPinRequest(null)} onSubmit={(pin) => pinRequest.retry(pin)} />}
      {notice && <p className="bg-amber-100 px-4 py-2 text-sm text-amber-900">{notice}</p>}

      <div className="flex border-b border-stone-200 bg-white lg:hidden">
        {(["menu", "order"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={cn("flex-1 py-2 text-sm font-medium", tab === tb ? "border-b-2 border-brand-600 text-brand-700" : "text-stone-500")}>
            {tb === "menu" ? t("order.tabMenu") : `${t("order.tabOrder")} (${itemCount + cart.length})`}
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
            {order && <FireBar order={order} pending={pending} onAct={act} />}
            {order?.kots.map((kot) => (
              <KotBlock key={kot.id} kot={kot} editable={editable} onAct={act} />
            ))}

            {editable && cart.length > 0 && (
              <div className="rounded-lg border-2 border-dashed border-brand-500/50 p-3">
                <p className="mb-2 text-xs font-semibold tracking-wide text-brand-700 uppercase">{t("order.newItems")}</p>
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
                <Input className="mt-3" placeholder={t("order.kitchenNote")} value={kotNote} onChange={(e) => setKotNote(e.target.value)} maxLength={200} />
                {!order && channelName && (
                  <Input className="mt-2" placeholder={`${channelName} order ID`} value={channelRef} onChange={(e) => setChannelRef(e.target.value)} maxLength={40} />
                )}
                {!order && !context.tableId && !channelName && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input placeholder={t("order.customerName")} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                    <Input placeholder={t("order.mobile")} inputMode="numeric" maxLength={10} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {!order && cart.length === 0 && <p className="py-10 text-center text-sm text-stone-500">{t("order.tapToStart")}</p>}

            {order && order.bill.subtotal > 0 && <BillBox order={order} restaurant={restaurant} />}

            {order && canBill && (
              <BillingPanel order={order} restaurant={restaurant} pending={pending} onAct={act} />
            )}
          </div>

          {error && <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {editable && cart.length > 0 && (
            <div className="border-t border-stone-200 p-3">
              <Button className="h-12 w-full text-base" disabled={pending} onClick={send}>
                <ChefHat size={18} /> {pending ? t("order.sending") : t("order.sendKot", { total: formatINR(cartTotal) })}
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
  onAct: Act;
}) {
  const t = useT();
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
            {!pendingApproval && kot.status === "ACCEPTED" && item.held && item.status !== "CANCELLED" ? (
              <Badge className="bg-purple-100 text-purple-800">{t("order.onHold")} · {COURSES[item.course]}</Badge>
            ) : (
              !pendingApproval && kot.status === "ACCEPTED" && <Badge tone={ITEM_TONE[item.status]}>{t(`status.${item.status}`)}</Badge>
            )}
            <span className="w-16 text-right">{formatINR(item.unitPrice * item.quantity)}</span>
            {editable && kot.status === "ACCEPTED" && item.status !== "CANCELLED" && item.status !== "SERVED" && (
              <button
                className="rounded p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                title="Cancel item"
                onClick={() => {
                  const reason = item.status === "NEW" ? prompt("Reason (optional)") ?? null : prompt("Reason for cancelling (required)");
                  if (reason !== null) onAct((pin) => cancelOrderItem(item.id, reason, pin));
                }}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {kot.note && <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-600">{t("order.note", { note: kot.note })}</p>}
      {pendingApproval && (
        <div className="flex gap-2 border-t border-amber-200 p-2">
          <Button size="sm" className="flex-1" onClick={() => onAct(() => acceptKot(kot.id))}>
            <Check size={14} /> {t("order.accept")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => confirm(t("order.rejectConfirm")) && onAct(() => rejectKot(kot.id))}>
            {t("order.reject")}
          </Button>
        </div>
      )}
      {ready.length > 0 && (
        <div className="border-t border-stone-100 p-2">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => onAct(() => markServed(ready.map((i) => i.id)))}>
            {t("order.markServed", { count: ready.length })}
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
  const t = useT();
  const b = order.bill;
  return (
    <dl className="space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
      <Row label={restaurant.gstMode === "INCLUSIVE" ? t("bill.taxable") : t("bill.subtotal")} value={formatINR(b.subtotal)} />
      {b.discount > 0 && (
        <Row label={order.coupon ? `${t("bill.coupon")} ${order.coupon.code}` : `${t("bill.discount")}${order.discount?.type === "PERCENT" ? ` (${order.discount.value}%)` : ""}`} value={`- ${formatINR(b.discount)}`} />
      )}
      {order.points.value > 0 && <Row label={`incl. ${order.points.redeemed} loyalty points`} value={`- ${formatINR(order.points.value)}`} />}
      {b.serviceCharge > 0 && <Row label={t("bill.serviceCharge")} value={formatINR(b.serviceCharge)} />}
      {b.cgst + b.sgst > 0 && (
        <>
          <Row label="CGST" value={formatINR(b.cgst)} />
          <Row label="SGST" value={formatINR(b.sgst)} />
        </>
      )}
      {b.roundOff !== 0 && <Row label={t("bill.roundOff")} value={formatINR(b.roundOff)} />}
      <div className="border-t border-stone-200 pt-1">
        <Row label={t("bill.total")} value={formatINR(b.grandTotal)} bold />
      </div>
      {order.paid > 0 && <Row label={t("bill.paid")} value={formatINR(order.paid)} />}
    </dl>
  );
}

function CouponBox({ order, pending, onAct }: { order: OrderView; pending: boolean; onAct: Act }) {
  const t = useT();
  const [code, setCode] = useState("");
  if (order.coupon) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm">
        <div>
          <p className="font-semibold text-green-800">Coupon {order.coupon.code}</p>
          <p className="text-xs text-green-700">{order.coupon.description}</p>
        </div>
        <button className="text-xs text-red-600 hover:underline" disabled={pending} onClick={() => onAct(() => applyCoupon(order.id, ""))}>
          {t("bill.remove")}
        </button>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{t("bill.coupon")}</p>
      <div className="flex gap-2">
        <Input placeholder="FIRST50" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <Button variant="secondary" disabled={pending || !code.trim()} onClick={() => onAct(() => applyCoupon(order.id, code), () => setCode(""))}>
          {t("bill.apply")}
        </Button>
      </div>
    </div>
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
  onAct: Act;
}) {
  const t = useT();
  const due = order.bill.grandTotal - order.paid;
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">(order.discount?.type ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(order.discount ? String(order.discount.value) : "");
  const channelName = order.channel === "ZOMATO" ? "Zomato" : order.channel === "SWIGGY" ? "Swiggy" : null;
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "AGGREGATOR" | "OTHER">(channelName ? "AGGREGATOR" : restaurant.upiId ? "UPI" : "CASH");
  const [amount, setAmount] = useState((due / 100).toFixed(2));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [upiQr, setUpiQr] = useState<string | null>(null);

  useEffect(() => setAmount((due / 100).toFixed(2)), [due]);
  useSoundbox(order.payments.map((p) => ({ id: p.id, amount: p.amount, online: p.method === "RAZORPAY" })));
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
        {!order.channel && <CustomerBox order={order} restaurant={restaurant} pending={pending} onAct={onAct} />}
        {!order.channel && <BuyerBox order={order} pending={pending} onAct={onAct} />}
        {order.channel && <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">No GST on this bill: Zomato/Swiggy pay GST on restaurant orders (Section 9(5)).</p>}
        {!order.channel && <CouponBox order={order} pending={pending} onAct={onAct} />}
        {!order.coupon && <p className="text-sm font-semibold">Discount</p>}
        <div className={cn("flex gap-2", order.coupon && "hidden")}>
          <Select className="w-24" value={discountType} onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FLAT")}>
            <option value="PERCENT">%</option>
            <option value="FLAT">₹</option>
          </Select>
          <Input type="number" min={0} placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => onAct((pin) => applyDiscount(order.id, discountType, Number(discountValue) || 0, "", pin))}
          >
            Apply
          </Button>
        </div>
        <Button className="h-11 w-full" disabled={pending} onClick={() => onAct(() => billOrder(order.id))}>
          <Printer size={16} /> {t("bill.generate")}
        </Button>
        <button
          className="w-full text-center text-xs text-red-600 hover:underline"
          onClick={() => {
            const reason = prompt("Reason for cancelling the whole order");
            if (reason) onAct((pin) => cancelWholeOrder(order.id, reason, pin));
          }}
        >
          {t("bill.cancelOrder")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg p-3 ring-1 ring-stone-200">
      <div className="flex gap-2">
        <Link href={`/dashboard/orders/${order.id}/invoice`} target="_blank" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
          <Printer size={16} /> {t("bill.print")}
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
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Collect payment · {formatINR(due)} due</p>
            <select
              aria-label="Split equally"
              className="rounded-md bg-stone-100 px-2 py-1 text-xs"
              value=""
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n > 1) setAmount((Math.ceil(due / n) / 100).toFixed(2));
              }}
            >
              <option value="">Split equally</option>
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} people · {formatINR(Math.ceil(due / n))} each
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(channelName ? (["AGGREGATOR", "CASH", "UPI", "OTHER"] as const) : (["CASH", "UPI", "CARD", "OTHER"] as const))
              .filter((m) => (m === "CASH" ? restaurant.acceptCash : m === "CARD" ? restaurant.acceptCard : true))
              .map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn("rounded-lg py-2 text-xs font-semibold", method === m ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700")}
                >
                  {m === "AGGREGATOR" ? channelName : m}
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
          {method === "UPI" && restaurant.razorpay && <AutoUpiQr orderId={order.id} amount={Number(amount)} />}
          {upiQr && !restaurant.razorpay && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upiQr} alt="UPI QR" className="mx-auto h-44 w-44" />
              <p className="text-xs text-stone-500">Customer scans to pay {formatINR(Math.round(Number(amount) * 100))}. Confirm after you receive it.</p>
            </div>
          )}
          <Button
            className="h-11 w-full"
            disabled={pending || !(Number(amount) > 0)}
            onClick={() => {
              const payload = { method, amount: Number(amount), reference: reference || undefined, clientRequestId: newRequestId() };
              const label = `${method} ${formatINR(Math.round(payload.amount * 100))} for order #${order.orderNumber}`;
              if (!navigator.onLine) {
                enqueue({ id: payload.clientRequestId, kind: "payment", label, createdAt: Date.now(), orderId: order.id, payload });
                setTendered("");
                return alert("You're offline. The payment is saved on this device and will sync when the internet is back.");
              }
              onAct(() => takePayment(order.id, payload), () => setTendered(""));
            }}
          >
            {method === "UPI" ? "Payment received" : "Record payment"} · {formatINR(Math.round(Number(amount) * 100) || 0)}
          </Button>
          {order.paid === 0 && (
            <button className="w-full text-center text-xs text-stone-500 hover:underline" onClick={() => onAct((pin) => reopenOrder(order.id, pin))}>
              Reopen bill to add or change items
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TableActions({ order, floorTables, canBill, onAct }: { order: OrderView; floorTables: FloorTableOption[]; canBill: boolean; onAct: Act }) {
  const router = useRouter();
  const [mode, setMode] = useState<"move" | "merge" | "split" | null>(null);
  const [split, setSplit] = useState<Record<string, number>>({});
  const free = floorTables.filter((t) => !t.orderId);
  const running = floorTables.filter((t) => t.orderId && t.orderId !== order.id && t.orderStatus === "OPEN");
  const items = order.kots.filter((k) => k.status === "ACCEPTED").flatMap((k) => k.items).filter((i) => i.status !== "CANCELLED");

  return (
    <>
      <div className="flex gap-1">
        <button onClick={() => setMode("move")} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50" title="Move to another table">
          <ArrowRightLeft size={14} /> <span className="hidden sm:inline">Move</span>
        </button>
        {order.status === "OPEN" && (
          <button onClick={() => setMode("merge")} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50" title="Merge another table into this bill">
            <Combine size={14} /> <span className="hidden sm:inline">Merge</span>
          </button>
        )}
        {canBill && order.status === "OPEN" && items.length > 0 && (
          <button onClick={() => setMode("split")} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50" title="Split bill">
            <Split size={14} /> <span className="hidden sm:inline">Split</span>
          </button>
        )}
      </div>
      {mode && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setMode(null)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {mode === "move" && (
              <>
                <h2 className="mb-1 font-semibold">Move to table</h2>
                <p className="mb-4 text-sm text-stone-500">The whole order, including the bill, moves to the new table.</p>
                <div className="grid grid-cols-4 gap-2">
                  {free.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onAct(() => transferTable(order.id, t.id), () => setMode(null))}
                      className="rounded-lg py-3 font-semibold ring-1 ring-stone-200 hover:bg-brand-50 hover:ring-brand-500"
                    >
                      {t.name}
                    </button>
                  ))}
                  {free.length === 0 && <p className="col-span-4 text-sm text-stone-500">No free tables.</p>}
                </div>
              </>
            )}
            {mode === "merge" && (
              <>
                <h2 className="mb-1 font-semibold">Merge into this bill</h2>
                <p className="mb-4 text-sm text-stone-500">Pick a table. Its items move here and that table becomes free.</p>
                <div className="grid grid-cols-4 gap-2">
                  {running.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => confirm(`Move all items from table ${t.name} into this bill?`) && onAct(() => mergeInto(order.id, t.orderId!), () => setMode(null))}
                      className="rounded-lg py-3 font-semibold ring-1 ring-stone-200 hover:bg-brand-50 hover:ring-brand-500"
                    >
                      {t.name}
                    </button>
                  ))}
                  {running.length === 0 && <p className="col-span-4 text-sm text-stone-500">No other running tables to merge.</p>}
                </div>
              </>
            )}
            {mode === "split" && (
              <>
                <h2 className="mb-1 font-semibold">Split bill</h2>
                <p className="mb-4 text-sm text-stone-500">Choose what goes on a separate bill. To split the amount equally instead, use “Split equally” when collecting payment.</p>
                <ul className="divide-y divide-stone-100">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        {i.name}
                        {i.variantName && ` (${i.variantName})`} <span className="text-stone-400">× {i.quantity}</span>
                      </span>
                      <div className="flex items-center rounded-lg ring-1 ring-stone-200">
                        <button className="p-1.5" onClick={() => setSplit((s) => ({ ...s, [i.id]: Math.max(0, (s[i.id] ?? 0) - 1) }))} aria-label="Less">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-semibold">{split[i.id] ?? 0}</span>
                        <button className="p-1.5" onClick={() => setSplit((s) => ({ ...s, [i.id]: Math.min(i.quantity, (s[i.id] ?? 0) + 1) }))} aria-label="More">
                          <Plus size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  disabled={!Object.values(split).some((q) => q > 0)}
                  onClick={() =>
                    onAct(
                      () => splitBill(order.id, Object.entries(split).map(([itemId, quantity]) => ({ itemId, quantity }))),
                      (data) => {
                        setMode(null);
                        setSplit({});
                        if (data) router.push(`/dashboard/orders/${data.orderId}`);
                      },
                    )
                  }
                >
                  Move to new bill
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CustomerBox({ order, restaurant, pending, onAct }: { order: OrderView; restaurant: WorkspaceRestaurant; pending: boolean; onAct: Act }) {
  const [phone, setPhone] = useState(order.customer?.phone ?? order.customerPhone ?? "");
  const [name, setName] = useState(order.customer?.name ?? order.customerName ?? "");
  const [points, setPoints] = useState(order.points.redeemed ? String(order.points.redeemed) : "");
  const c = order.customer;
  return (
    <div className="space-y-2 border-b border-stone-100 pb-3">
      <p className="text-sm font-semibold">Customer</p>
      {c ? (
        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span>
            {c.name || "Guest"} · {c.phone}
            <span className="block text-xs text-stone-500">
              {c.visits} visit{c.visits === 1 ? "" : "s"}
              {restaurant.loyalty.enabled && ` · ${c.points} points`}
            </span>
          </span>
          <button className="text-xs text-stone-500 hover:underline" disabled={pending} onClick={() => onAct(() => setCustomer(order.id, "", ""))}>
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input placeholder="Mobile" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="secondary" disabled={pending || phone.length !== 10} onClick={() => onAct(() => setCustomer(order.id, phone, name))}>
            Add
          </Button>
        </div>
      )}
      {c && restaurant.loyalty.enabled && (c.points >= restaurant.loyalty.minRedeem || order.points.redeemed > 0) && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder={`Points (min ${restaurant.loyalty.minRedeem})`}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
          <Button variant="secondary" disabled={pending} onClick={() => onAct(() => applyPoints(order.id, Math.floor(Number(points) || 0)))}>
            {order.points.redeemed ? "Update" : "Redeem"}
          </Button>
        </div>
      )}
      {c && restaurant.loyalty.enabled && order.points.redeemed > 0 && (
        <p className="text-xs text-green-700">
          {order.points.redeemed} points = {formatINR(order.points.value)} off
        </p>
      )}
    </div>
  );
}

function BuyerBox({ order, pending, onAct }: { order: OrderView; pending: boolean; onAct: Act }) {
  const saved = order.buyer;
  const remembered = order.customer?.gstin ? { gstin: order.customer.gstin, name: order.customer.businessName, address: order.customer.businessAddress } : null;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    gstin: saved?.gstin ?? remembered?.gstin ?? "",
    name: saved?.name ?? remembered?.name ?? "",
    address: saved?.address ?? remembered?.address ?? "",
  });

  if (saved && !open) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
        <span>
          <span className="font-semibold">B2B:</span> {saved.name}
          <span className="block text-xs text-stone-600">GSTIN {saved.gstin}</span>
        </span>
        <span className="flex gap-2 text-xs">
          <button className="text-stone-600 hover:underline" onClick={() => setOpen(true)}>
            Edit
          </button>
          <button className="text-red-600 hover:underline" disabled={pending} onClick={() => onAct(() => setBuyer(order.id, "", "", ""))}>
            Remove
          </button>
        </span>
      </div>
    );
  }
  if (!open) {
    return (
      <button className="text-left text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        + Business bill (add customer&apos;s GSTIN){remembered && ` · ${remembered.name}`}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg p-3 ring-1 ring-blue-200">
      <p className="text-sm font-semibold">Business (B2B) bill</p>
      <Input placeholder="Buyer GSTIN" value={form.gstin} maxLength={15} className="uppercase" onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
      <Input placeholder="Registered business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input placeholder="Billing address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => onAct(() => setBuyer(order.id, form.gstin, form.name, form.address), () => setOpen(false))}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "Fire Mains (3)" while later courses are on hold. */
function FireBar({ order, pending, onAct }: { order: OrderView; pending: boolean; onAct: Act }) {
  const held = order.kots
    .filter((k) => k.status === "ACCEPTED")
    .flatMap((k) => k.items)
    .filter((i) => i.held && i.status !== "CANCELLED");
  const course = nextCourse(held.map((i) => i.course));
  if (course === null) return null;
  const count = held.filter((i) => i.course === course).reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-purple-50 px-3 py-2 ring-1 ring-purple-200">
      <span className="text-sm text-purple-900">
        {count} {COURSES[course].toLowerCase()} item{count === 1 ? "" : "s"} waiting
      </span>
      <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={pending} onClick={() => onAct(() => fireCourse(order.id))}>
        🔥 Fire {COURSES[course]}
      </Button>
    </div>
  );
}

/** Razorpay dynamic QR for the amount: the screen waits and confirms by itself when the customer pays. */
function AutoUpiQr({ orderId, amount }: { orderId: string; amount: number }) {
  const [qr, setQr] = useState<{ requestId: string; imageUrl: string; amount: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!qr || status !== "waiting") return;
    const id = setInterval(async () => {
      const res = await checkUpiQr(qr.requestId);
      if (res.ok && res.data.paid) setStatus("paid");
    }, 4000);
    return () => clearInterval(id);
  }, [qr, status]);

  if (status === "paid" && qr) return <p className="rounded-lg bg-green-50 px-3 py-3 text-center font-semibold text-green-800">✓ {formatINR(qr.amount)} received on UPI</p>;
  if (qr && status === "waiting")
    return (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.imageUrl} alt={`UPI QR for ${formatINR(qr.amount)}`} className="mx-auto h-56 w-56 object-contain" />
        <p className="text-sm font-medium">Scan to pay {formatINR(qr.amount)}</p>
        <p className="mt-1 animate-pulse text-xs text-stone-500">Waiting for payment… it will confirm by itself</p>
        <button className="mt-2 text-xs text-stone-500 underline" onClick={() => (setQr(null), setStatus("idle"))}>
          Cancel QR
        </button>
      </div>
    );
  return (
    <div className="space-y-1">
      <Button
        className="w-full"
        variant="secondary"
        disabled={pending || !(amount > 0)}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await showUpiQr(orderId, amount);
            if (!res.ok) return setError(res.error);
            setQr(res.data!);
            setStatus("waiting");
          })
        }
      >
        Show UPI QR for {formatINR(Math.round(amount * 100) || 0)} (confirms automatically)
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
