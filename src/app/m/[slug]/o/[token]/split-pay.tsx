"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Minus, Plus, Share2, Star } from "lucide-react";
import { formatINR } from "@/lib/gst";
import { buildUpiLink, type OnlinePaymentMode } from "@/lib/payments";
import { equalShare, itemsShare, normaliseShare } from "@/lib/split";
import { cn } from "@/lib/utils";
import type { OrderItemView, OrderView } from "@/server/order-view";
import { rateDishes } from "../../../actions";

type Mode = "full" | "equal" | "items" | "custom";

/**
 * Pay the bill from a phone: the whole amount, an equal share, just your dishes, or any amount.
 * Friends at the table open the same link and pay their part.
 */
export function SplitPay({
  order,
  mode: payMode,
  upi,
  pending,
  onPayOnline,
}: {
  order: OrderView;
  mode: OnlinePaymentMode;
  upi: { id: string; name: string } | null;
  pending: boolean;
  onPayOnline: (amountPaise: number) => void;
}) {
  const due = order.bill.grandTotal - order.paid;
  const items = order.kots.filter((k) => k.status === "ACCEPTED").flatMap((k) => k.items).filter((i) => i.status !== "CANCELLED");
  const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const [mode, setMode] = useState<Mode>("full");
  const [people, setPeople] = useState(2);
  const [mine, setMine] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  const share = useMemo(() => {
    if (mode === "full") return due;
    if (mode === "equal") return equalShare(due, people);
    if (mode === "items") return itemsShare(order.bill.grandTotal, itemsTotal, items.reduce((s, i) => s + i.unitPrice * (mine[i.id] ?? 0), 0), due);
    return Math.round(Number(custom || 0) * 100);
  }, [mode, due, people, mine, custom, order.bill.grandTotal, itemsTotal, items]);
  const checked = normaliseShare(share, due);
  const amount = "amount" in checked ? checked.amount : 0;
  const upiLink = upi && amount ? buildUpiLink({ upiId: upi.id, payeeName: upi.name, amountPaise: amount, note: order.invoiceNumber ?? `Order ${order.orderNumber}` }) : null;

  useEffect(() => {
    if (!upiLink) return setQr(null);
    QRCode.toDataURL(upiLink, { width: 240, margin: 1 }).then(setQr);
  }, [upiLink]);

  const shareText = `Our bill at the table: ${formatINR(due)} left to pay. Pay your share here: ${typeof window !== "undefined" ? window.location.href : ""}`;

  return (
    <section className="space-y-4 rounded-xl p-4 ring-2 ring-[var(--theme)]">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold">{formatINR(due)} to pay</p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-[#128C7E] ring-1 ring-[#25D366]"
        >
          <Share2 size={14} /> Share with friends
        </a>
      </div>

      {order.payments.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          {order.payments.map((p, i) => (
            <li key={i} className="flex justify-between">
              <span>✓ {p.method === "RAZORPAY" ? "Paid online" : `Paid by ${p.method.toLowerCase()}`}</span>
              <span>{formatINR(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {payMode !== "NONE" && (
        <>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-stone-100 p-1 text-xs font-semibold">
            {(
              [
                ["full", "Full bill"],
                ["equal", "Split equally"],
                ["items", "My items"],
                ["custom", "Amount"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={cn("rounded-md py-2", mode === m ? "bg-white shadow-sm" : "text-stone-500")}>
                {label}
              </button>
            ))}
          </div>

          {mode === "equal" && (
            <div className="flex items-center justify-between text-sm">
              <span>Split between</span>
              <span className="flex items-center gap-3">
                <button className="rounded-full p-1 ring-1 ring-stone-300" onClick={() => setPeople((p) => Math.max(2, p - 1))} aria-label="Fewer people">
                  <Minus size={14} />
                </button>
                <span className="w-16 text-center font-semibold">{people} people</span>
                <button className="rounded-full p-1 ring-1 ring-stone-300" onClick={() => setPeople((p) => Math.min(20, p + 1))} aria-label="More people">
                  <Plus size={14} />
                </button>
              </span>
            </div>
          )}

          {mode === "items" && (
            <ul className="divide-y divide-stone-100 text-sm">
              {items.map((i) => (
                <ItemPicker key={i.id} item={i} value={mine[i.id] ?? 0} onChange={(q) => setMine((m) => ({ ...m, [i.id]: q }))} />
              ))}
              <li className="pt-2 text-xs text-stone-500">Your share includes the same proportion of tax, discount and service charge.</li>
            </ul>
          )}

          {mode === "custom" && (
            <input
              type="number"
              min={1}
              inputMode="decimal"
              placeholder="Amount in ₹"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-11 w-full rounded-lg border border-stone-300 px-3 text-center text-lg"
            />
          )}

          {"error" in checked && mode !== "full" && share > 0 && <p className="text-center text-sm text-red-600">{checked.error}</p>}

          {payMode === "RAZORPAY" && (
            <button
              disabled={pending || !amount}
              onClick={() => onPayOnline(amount)}
              className="w-full rounded-lg bg-[var(--theme)] py-3 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Opening..." : amount ? `Pay ${formatINR(amount)} online` : "Choose what to pay"}
            </button>
          )}
          {payMode === "UPI_QR" && amount > 0 && qr && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`UPI QR for ${formatINR(amount)}`} className="mx-auto h-52 w-52" />
              <a href={upiLink!} className="mt-3 block w-full rounded-lg bg-[var(--theme)] py-3 font-semibold text-white">
                Pay {formatINR(amount)} with UPI app
              </a>
              <p className="mt-2 text-xs text-stone-500">After paying, show the success screen to the staff so they can mark your share as paid.</p>
            </div>
          )}
        </>
      )}
      {payMode === "NONE" && <p className="text-center text-sm text-stone-600">Please pay at the counter.</p>}
    </section>
  );
}

function ItemPicker({ item, value, onChange }: { item: OrderItemView; value: number; onChange: (q: number) => void }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1">
        {item.name}
        {item.variantName && ` (${item.variantName})`}
        <span className="block text-xs text-stone-500">
          {item.quantity} × {formatINR(item.unitPrice)}
        </span>
      </span>
      <span className="flex items-center rounded-lg ring-1 ring-stone-200">
        <button className="p-1.5" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Less ${item.name}`}>
          <Minus size={14} />
        </button>
        <span className="w-6 text-center font-semibold">{value}</span>
        <button className="p-1.5" onClick={() => onChange(Math.min(item.quantity, value + 1))} aria-label={`More ${item.name}`}>
          <Plus size={14} />
        </button>
      </span>
    </li>
  );
}

/** After paying: rate each dish (1-5 stars). Shown once per dish per order. */
export function RateDishes({ order, alreadyRated }: { order: OrderView; alreadyRated: string[] }) {
  const dishes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of order.kots) for (const i of k.items) if (i.menuItemId && i.status !== "CANCELLED" && !alreadyRated.includes(i.menuItemId)) seen.set(i.menuItemId, i.name);
    return [...seen];
  }, [order.kots, alreadyRated]);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) return <p className="rounded-xl bg-green-50 p-4 text-center text-sm font-medium text-green-800">{result.ok}</p>;
  if (!dishes.length) return null;

  return (
    <section className="space-y-3 rounded-xl p-4 ring-1 ring-stone-200">
      <p className="font-semibold">How was the food?</p>
      <ul className="space-y-2">
        {dishes.map(([id, name]) => (
          <li key={id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{name}</span>
            <span className="flex shrink-0">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setStars((s) => ({ ...s, [id]: n }))} aria-label={`${n} star${n > 1 ? "s" : ""} for ${name}`} className="p-0.5">
                  <Star size={24} className={n <= (stars[id] ?? 0) ? "fill-amber-400 text-amber-400" : "text-stone-300"} />
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={300} placeholder="Anything to tell the kitchen? (optional)" className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      <button
        disabled={pending || !Object.keys(stars).length}
        onClick={() =>
          start(async () => {
            const res = await rateDishes(
              order.publicToken,
              Object.entries(stars).map(([menuItemId, rating]) => ({ menuItemId, rating, comment: comment || undefined })),
            );
            setResult(res.ok ? { ok: "Thank you for rating! 🙏" } : { error: res.error });
          })
        }
        className="w-full rounded-lg bg-[var(--theme)] py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Sending..." : "Submit rating"}
      </button>
    </section>
  );
}
