"use client";

import Link from "next/link";
import { useState } from "react";
import { Bike, ShoppingBag } from "lucide-react";
import { FloorAlerts, OtherOrders, SoundToggle, TableGrid } from "@/components/floor-view";
import { Card } from "@/components/ui";
import { formatINR } from "@/lib/gst";
import { beep, useLiveRefresh } from "@/hooks/use-live";
import type { FloorOrder, FloorTable } from "@/server/floor";

export function PosScreen({
  tables,
  others,
  stats,
  title,
}: {
  tables: FloorTable[];
  others: FloorOrder[];
  stats: { sales: number; orders: number; running: number } | null;
  title: string;
}) {
  const [sound, setSound] = useState(false);
  useLiveRefresh({ onChange: () => sound && beep() });

  return (
    <div className="max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex flex-wrap gap-2">
          <SoundToggle on={sound} setOn={setSound} />
          <Link href="/dashboard/orders/new?type=TAKEAWAY" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            <ShoppingBag size={16} /> Takeaway
          </Link>
          <Link href="/dashboard/orders/new?type=DELIVERY" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
            <Bike size={16} /> Delivery
          </Link>
        </div>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-stone-500">Today&apos;s sales</p>
            <p className="text-xl font-semibold">{formatINR(stats.sales)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-stone-500">Bills paid today</p>
            <p className="text-xl font-semibold">{stats.orders}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-stone-500">Running orders</p>
            <p className="text-xl font-semibold">{stats.running}</p>
          </Card>
        </div>
      )}

      <FloorAlerts tables={tables} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          {tables.length ? <TableGrid tables={tables} /> : <p className="text-sm text-stone-500">Add tables in Tables &amp; QR to see them here.</p>}
          <div className="mt-4 flex gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded ring-2 ring-stone-200" /> Free</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand-50 ring-2 ring-brand-500" /> Running</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-50 ring-2 ring-amber-400" /> Bill printed</span>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-stone-500">Takeaway &amp; delivery</h2>
          <OtherOrders orders={others} />
        </div>
      </div>
    </div>
  );
}
