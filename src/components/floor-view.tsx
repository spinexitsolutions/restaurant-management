"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell, BellRing, Droplets, Receipt, Volume2, VolumeX } from "lucide-react";
import { formatINR } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { beep } from "@/hooks/use-live";
import { resolveRequest } from "@/app/dashboard/orders/actions";
import type { FloorOrder, FloorTable } from "@/server/floor";

const REQUEST_LABEL = { CALL_WAITER: "Calling waiter", REQUEST_BILL: "Wants the bill", WATER: "Needs water" };
const REQUEST_ICON = { CALL_WAITER: BellRing, REQUEST_BILL: Receipt, WATER: Droplets };

function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function SoundToggle({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) {
  return (
    <button
      onClick={() => {
        setOn(!on);
        if (!on) beep();
      }}
      className={cn("inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1", on ? "bg-green-50 text-green-800 ring-green-300" : "bg-white text-stone-600 ring-stone-300")}
    >
      {on ? <Volume2 size={16} /> : <VolumeX size={16} />} Sound {on ? "on" : "off"}
    </button>
  );
}

/** Alerts that need someone on the floor: customer requests, QR orders awaiting approval, food ready. */
export function FloorAlerts({ tables }: { tables: FloorTable[] }) {
  const [pending, start] = useTransition();
  const requests = tables.flatMap((t) => t.requests.map((r) => ({ ...r, table: t.name })));
  const approvals = tables.filter((t) => t.order?.pendingApproval);
  const ready = tables.filter((t) => t.order?.readyCount);
  if (!requests.length && !approvals.length && !ready.length) return null;

  return (
    <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {approvals.map((t) => (
        <Link key={`a${t.id}`} href={`/dashboard/orders/${t.order!.id}`} className="flex items-center gap-3 rounded-lg bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">
          <Bell size={18} /> Table {t.name}: new QR order, tap to accept
        </Link>
      ))}
      {ready.map((t) => (
        <Link key={`r${t.id}`} href={`/dashboard/orders/${t.order!.id}`} className="flex items-center gap-3 rounded-lg bg-green-100 px-4 py-3 text-sm font-medium text-green-900">
          🍽️ Table {t.name}: {t.order!.readyCount} item(s) ready to serve
        </Link>
      ))}
      {requests.map((r) => {
        const Icon = REQUEST_ICON[r.type];
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-lg bg-blue-100 px-4 py-3 text-sm font-medium text-blue-900">
            <Icon size={18} />
            <span className="flex-1">
              Table {r.table}: {REQUEST_LABEL[r.type]} <span className="font-normal opacity-70">· {minutesSince(r.createdAt)}m</span>
            </span>
            <button disabled={pending} onClick={() => start(async () => void (await resolveRequest(r.id)))} className="rounded-md bg-white/70 px-2 py-1 text-xs">
              Done
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
            {state === "billed" ? "Bill printed" : `${o.itemCount} items · ${minutesSince(o.createdAt)}m`}
          </span>
        </>
      ) : table.reservation ? (
        <span className="mt-0.5 rounded bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-800">
          Reserved {new Date(table.reservation.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}
        </span>
      ) : (
        <span className="text-xs text-stone-400">{table.capacity} seats</span>
      )}
    </Link>
  );
}

export function OtherOrders({ orders }: { orders: FloorOrder[] }) {
  if (!orders.length) return <p className="text-sm text-stone-500">No running takeaway or delivery orders.</p>;
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/dashboard/orders/${o.id}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 hover:ring-brand-500">
            <span>
              <span className="font-semibold">#{o.orderNumber}</span> {o.tableName ? `Table ${o.tableName}` : o.type === "DELIVERY" ? "Delivery" : "Takeaway"}
              {o.customerName && <span className="text-stone-500"> · {o.customerName}</span>}
              {o.readyCount > 0 && <span className="ml-2 text-green-700">· ready</span>}
            </span>
            <span className="font-medium">{formatINR(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

