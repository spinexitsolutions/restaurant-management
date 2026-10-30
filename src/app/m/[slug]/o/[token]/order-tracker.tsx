"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, Clock, Droplets, Plus, Receipt } from "lucide-react";
import { FoodTypeIcon } from "@/components/ui";
import { formatINR } from "@/lib/gst";
import type { OnlinePaymentMode } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { useLiveRefresh } from "@/hooks/use-live";
import { loadRazorpay } from "@/lib/client/razorpay-checkout";
import type { OrderView } from "@/server/order-view";
import { confirmRazorpayPayment, requestService, startRazorpayPayment } from "../../../actions";

const STATUS_TEXT = { NEW: "Order received", PREPARING: "Being prepared", READY: "Ready", SERVED: "Served", CANCELLED: "Cancelled" };
const STATUS_COLOR = { NEW: "text-stone-500", PREPARING: "text-amber-600", READY: "text-green-600", SERVED: "text-stone-400", CANCELLED: "text-red-500" };

export function OrderTracker({
  order,
  restaurant,
  menuUrl,
  payment,
}: {
  order: OrderView;
  restaurant: { name: string; slug: string; themeColor: string };
  menuUrl: string;
  payment: { mode: OnlinePaymentMode; upiLink: string | null; upiQr: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  useLiveRefresh({ orderToken: order.publicToken, intervalMs: 5000 });

  const waitingApproval = order.kots.some((k) => k.status === "PENDING_APPROVAL");
  const items = order.kots.filter((k) => k.status !== "REJECTED").flatMap((k) => k.items.map((i) => ({ ...i, pending: k.status === "PENDING_APPROVAL" })));
  const rejected = order.kots.some((k) => k.status === "REJECTED");
  const due = order.bill.grandTotal - order.paid;
  const open = order.status === "OPEN" || order.status === "BILLED";

  function ask(type: "CALL_WAITER" | "REQUEST_BILL" | "WATER", text: string) {
    start(async () => {
      const res = await requestService(order.publicToken, type);
      setMessage(res.ok ? { ok: text } : { error: res.error });
    });
  }

  function payOnline() {
    setMessage(null);
    start(async () => {
      const res = await startRazorpayPayment(order.publicToken);
      if (!res.ok) return setMessage({ error: res.error });
      if (!(await loadRazorpay()) || !window.Razorpay) return setMessage({ error: "Couldn't load the payment page. Check your internet." });
      const { keyId, razorpayOrderId, amount, name, description } = res.data;
      new window.Razorpay({
        key: keyId,
        order_id: razorpayOrderId,
        amount,
        currency: "INR",
        name,
        description,
        notes: { orderId: order.id },
        theme: { color: restaurant.themeColor },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const done = await confirmRazorpayPayment(order.publicToken, resp);
          setMessage(done.ok ? { ok: "Payment successful. Thank you!" } : { error: done.error });
          router.refresh();
        },
      }).open();
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white pb-10" style={{ "--theme": restaurant.themeColor } as React.CSSProperties}>
      <header className="px-4 pt-6 pb-4 text-white" style={{ background: "var(--theme)" }}>
        <p className="text-sm opacity-90">{restaurant.name}</p>
        <h1 className="text-2xl font-bold">
          {order.status === "PAID"
            ? "Thank you! 🙏"
            : order.status === "CANCELLED"
              ? "Order cancelled"
              : order.status === "BILLED"
                ? "Your bill is ready"
                : waitingApproval
                  ? "Sending to the kitchen..."
                  : "Order confirmed"}
        </h1>
        <p className="text-sm opacity-90">
          {order.tableName && `Table ${order.tableName} · `}Order #{order.orderNumber}
        </p>
      </header>

      <main className="space-y-4 p-4">
        {waitingApproval && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Clock size={16} /> Waiting for the restaurant to confirm your order. This usually takes a minute.
          </p>
        )}
        {rejected && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Some items could not be accepted. Please ask the staff.</p>}
        {message?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message.ok}</p>}
        {message?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message.error}</p>}

        <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
          {items.map((i) => (
            <li key={i.id} className={cn("flex items-start gap-3 px-4 py-3", i.status === "CANCELLED" && "opacity-50")}>
              <span className="mt-0.5">
                <FoodTypeIcon type={i.foodType} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {i.quantity} × {i.name}
                  {i.variantName && ` (${i.variantName})`}
                </p>
                {i.addons.length > 0 && <p className="text-xs text-stone-500">+ {i.addons.join(", ")}</p>}
                <p className={cn("text-xs font-semibold", i.pending ? "text-amber-600" : STATUS_COLOR[i.status])}>{i.pending ? "Awaiting confirmation" : STATUS_TEXT[i.status]}</p>
              </div>
              <span className="text-sm">{formatINR(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>

        {order.status === "OPEN" && (
          <div className="grid grid-cols-2 gap-2">
            <Link href={menuUrl} className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold ring-1 ring-stone-300">
              <Plus size={16} /> Order more
            </Link>
            <button disabled={pending} onClick={() => ask("REQUEST_BILL", "The staff will bring your bill.")} className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold ring-1 ring-stone-300">
              <Receipt size={16} /> Get the bill
            </button>
          </div>
        )}
        {open && order.tableName && (
          <div className="grid grid-cols-2 gap-2">
            <button disabled={pending} onClick={() => ask("CALL_WAITER", "A waiter is on the way.")} className="flex items-center justify-center gap-2 rounded-lg bg-stone-100 py-3 text-sm font-semibold">
              <BellRing size={16} /> Call waiter
            </button>
            <button disabled={pending} onClick={() => ask("WATER", "Water is on the way.")} className="flex items-center justify-center gap-2 rounded-lg bg-stone-100 py-3 text-sm font-semibold">
              <Droplets size={16} /> Water
            </button>
          </div>
        )}

        <dl className="space-y-1 rounded-xl bg-stone-50 p-4 text-sm">
          <Row label="Subtotal" value={order.bill.subtotal} />
          {order.bill.discount > 0 && <Row label="Discount" value={-order.bill.discount} />}
          {order.bill.serviceCharge > 0 && <Row label="Service charge" value={order.bill.serviceCharge} />}
          {order.bill.cgst + order.bill.sgst > 0 && (
            <>
              <Row label="CGST" value={order.bill.cgst} />
              <Row label="SGST" value={order.bill.sgst} />
            </>
          )}
          {order.bill.roundOff !== 0 && <Row label="Round off" value={order.bill.roundOff} />}
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-bold">
            <dt>{order.status === "OPEN" ? "Running total" : "Total"}</dt>
            <dd>{formatINR(order.bill.grandTotal)}</dd>
          </div>
          {order.paid > 0 && <Row label="Paid" value={order.paid} />}
        </dl>

        {order.status === "BILLED" && due > 0 && (
          <section className="rounded-xl p-4 text-center ring-2" style={{ borderColor: "var(--theme)", ["--tw-ring-color" as string]: "var(--theme)" }}>
            <p className="mb-3 text-lg font-bold">Pay {formatINR(due)}</p>
            {payment.mode === "RAZORPAY" && (
              <button disabled={pending} onClick={payOnline} className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60" style={{ background: "var(--theme)" }}>
                {pending ? "Opening..." : "Pay online (UPI / Card)"}
              </button>
            )}
            {payment.mode === "UPI_QR" && payment.upiQr && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={payment.upiQr} alt="UPI QR code" className="mx-auto h-52 w-52" />
                <a href={payment.upiLink!} className="mt-3 block w-full rounded-lg py-3 font-semibold text-white" style={{ background: "var(--theme)" }}>
                  Pay with UPI app
                </a>
                <p className="mt-2 text-xs text-stone-500">After paying, show the success screen to the staff.</p>
              </>
            )}
            {payment.mode === "NONE" && <p className="text-sm text-stone-600">Please pay at the counter.</p>}
          </section>
        )}

        {order.status === "PAID" && (
          <div className="rounded-xl bg-green-50 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-green-600" size={32} />
            <p className="font-semibold text-green-800">Payment received</p>
            <Link href={`/i/${order.publicToken}`} className="mt-3 inline-block text-sm font-semibold underline">
              View / download bill
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd>{value < 0 ? `- ${formatINR(-value)}` : formatINR(value)}</dd>
    </div>
  );
}
