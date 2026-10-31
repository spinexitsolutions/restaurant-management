"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, BellRing, Droplets, Receipt, Volume2, VolumeX } from "lucide-react";
import { formatINR } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { beep } from "@/hooks/use-live";
import { markServed, resolveRequest } from "@/app/dashboard/orders/actions";
import type { FloorOrder, FloorTable } from "@/server/floor";
import type { BoardToken } from "@/server/tokens";
import { useT } from "./i18n";

const REQUEST_LABEL = { CALL_WAITER: "floor.callWaiter", REQUEST_BILL: "floor.wantsBill", WATER: "floor.water" } as const;
const REQUEST_ICON = { CALL_WAITER: BellRing, REQUEST_BILL: Receipt, WATER: Droplets };

function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function SoundToggle({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) {
  const t = useT();
  return (
    <button
      onClick={() => {
        setOn(!on);
        if (!on) beep();
      }}
      className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1", on ? "bg-green-50 text-green-800 ring-green-300" : "bg-white text-stone-600 ring-stone-300")}
    >
      {on ? <Volume2 size={16} /> : <VolumeX size={16} />} {on ? t("floor.soundOn") : t("floor.soundOff")}
    </button>
  );
}

/** Alerts that need someone on the floor: customer requests, QR orders awaiting approval, food ready. */
export function FloorAlerts({ tables }: { tables: FloorTable[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  const requests = tables.flatMap((t) => t.requests.map((r) => ({ ...r, table: t.name })));
  const approvals = tables.filter((t) => t.order?.pendingApproval);
  const ready = tables.filter((t) => t.order?.readyCount);
  const fire = tables.filter((t) => t.order?.readyToFire);
  if (!requests.length && !approvals.length && !ready.length && !fire.length) return null;

  return (
    <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {approvals.map((tb) => (
        <Link key={`a${tb.id}`} href={`/dashboard/orders/${tb.order!.id}`} className="flex items-center gap-3 rounded-lg bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
          <Bell size={18} /> {t("floor.qrOrder", { name: tb.name })}
        </Link>
      ))}
      {ready.map((tb) => (
        <Link key={`r${tb.id}`} href={`/dashboard/orders/${tb.order!.id}`} className="flex items-center gap-3 rounded-lg bg-green-100 px-4 py-3 text-sm font-medium text-green-900">
          🍽️ {t("floor.ready", { name: tb.name, count: tb.order!.readyCount })}
        </Link>
      ))}
      {fire.map((tb) => (
        <Link key={`f${tb.id}`} href={`/dashboard/orders/${tb.order!.id}`} className="flex items-center gap-3 rounded-lg bg-purple-100 px-4 py-3 text-sm font-medium text-purple-900">
          🔥 {t("floor.fire", { name: tb.name, count: tb.order!.heldCount })}
        </Link>
      ))}
      {requests.map((r) => {
        const Icon = REQUEST_ICON[r.type];
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-lg bg-blue-100 px-4 py-3 text-sm font-medium text-blue-900">
            <Icon size={18} />
            <span className="flex-1">
              {t("floor.table", { name: r.table })}: {t(REQUEST_LABEL[r.type])} <span className="font-normal opacity-70">· {minutesSince(r.createdAt)}m</span>
            </span>
            <button disabled={pending} onClick={() => start(async () => void (await resolveRequest(r.id)))} className="rounded-md bg-white/70 px-2 py-1 text-xs">
              {t("floor.done")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function TableGrid({ tables }: { tables: FloorTable[] }) {
  const areas = [...new Set(tables.map((t) => t.area))];
  return (
    <div className="space-y-6">
      {areas.map((area) => (
        <section key={area}>
          {areas.length > 1 && <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{area}</h2>}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {tables
              .filter((t) => t.area === area)
              .map((t) => (
                <TableTile key={t.id} table={t} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TableTile({ table }: { table: FloorTable }) {
  const t = useT();
  const o = table.order;
  const state = !o ? "free" : o.status === "BILLED" ? "billed" : "occupied";
  const styles = {
    free: "bg-white ring-stone-200 text-stone-700",
    occupied: "bg-brand-50 ring-brand-500 text-brand-900",
    billed: "bg-amber-50 ring-amber-400 text-amber-900",
  };
  return (
    <Link
      href={o ? `/dashboard/orders/${o.id}` : `/dashboard/orders/new?table=${table.id}`}
      className={cn("relative flex aspect-square flex-col items-center justify-center rounded-xl p-2 text-center ring-2 transition active:scale-95", styles[state])}
    >
      {(table.requests.length > 0 || o?.pendingApproval || o?.readyCount) && (
        <span className="absolute top-2 right-2 h-3 w-3 animate-pulse rounded-full bg-red-500" />
      )}
      <span className="text-xl font-bold">{table.name}</span>
      {o ? (
        <>
          <span className="text-sm font-semibold">{formatINR(o.total).replace(".00", "")}</span>
          <span className="text-xs opacity-70">
            {state === "billed" ? t("floor.billPrinted") : t("floor.itemsMins", { count: o.itemCount, mins: minutesSince(o.createdAt) })}
          </span>
        </>
      ) : table.reservation ? (
        <span className="mt-0.5 rounded bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-800">
          {t("floor.reserved", { time: new Date(table.reservation.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }) })}
        </span>
      ) : (
        <span className="text-xs text-stone-400">{t("floor.seats", { count: table.capacity })}</span>
      )}
    </Link>
  );
}

export function OtherOrders({ orders }: { orders: FloorOrder[] }) {
  const t = useT();
  if (!orders.length) return <p className="text-sm text-stone-500">{t("floor.noOthers")}</p>;
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/dashboard/orders/${o.id}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 hover:ring-brand-500">
            <span>
              <span className="font-semibold">{o.tokenNumber ? `Token ${o.tokenNumber}` : `#${o.orderNumber}`}</span> {o.tableName ? t("floor.table", { name: o.tableName }) : o.channel ? (o.channel === "ZOMATO" ? "Zomato" : "Swiggy") : o.type === "DELIVERY" ? t("floor.delivery") : t("floor.takeaway")}
              {o.customerName && <span className="text-stone-500"> · {o.customerName}</span>}
              {o.readyCount > 0 && <span className="ml-2 text-green-700">· {t("floor.readyShort")}</span>}
            </span>
            <span className="font-medium">{formatINR(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}


/** QSR: tokens whose food is ready, with one tap to mark them collected. */
export function PickupStrip({ tokens }: { tokens: { preparing: BoardToken[]; ready: BoardToken[] } }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="mb-6 rounded-xl bg-green-50 p-4 ring-1 ring-green-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-green-900">{t("token.ready")}</h2>
        <span className="text-sm text-stone-600">{t("token.preparing", { count: tokens.preparing.length })}</span>
      </div>
      {tokens.ready.length === 0 ? (
        <p className="text-sm text-stone-500">—</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tokens.ready.map((r) => (
            <div key={r.orderId} className="flex items-center gap-2 rounded-lg bg-white py-1.5 pr-1.5 pl-3 ring-1 ring-green-300">
              <Link href={`/dashboard/orders/${r.orderId}`} className="text-lg font-bold text-green-900">
                {r.token}
              </Link>
              {r.label && <span className="max-w-24 truncate text-xs text-stone-500">{r.label}</span>}
              <button
                disabled={pending}
                onClick={() => start(async () => void (await markServed(r.readyItemIds)))}
                className="rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white"
              >
                {t("token.handedOver")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
