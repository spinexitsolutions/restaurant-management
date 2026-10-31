"use client";

import Link from "next/link";
import { useState } from "react";
import { Bike, ShoppingBag } from "lucide-react";
import { FloorAlerts, OtherOrders, PickupStrip, SoundToggle, TableGrid } from "@/components/floor-view";
import type { BoardToken } from "@/server/tokens";
import { Card } from "@/components/ui";
import { formatINR } from "@/lib/gst";
import { beep, useLiveRefresh } from "@/hooks/use-live";
import { useSoundbox } from "@/hooks/use-soundbox";
import type { FloorOrder, FloorTable } from "@/server/floor";
import { useT } from "@/components/i18n";
import type { MessageKey } from "@/lib/i18n";

export function PosScreen({
  tables,
  others,
  stats,
  title,
  recentPayments,
  tokens,
}: {
  tables: FloorTable[];
  others: FloorOrder[];
  stats: { sales: number; orders: number; running: number } | null;
  title: MessageKey;
  recentPayments?: { id: string; amount: number; online: boolean }[];
  tokens?: { preparing: BoardToken[]; ready: BoardToken[] } | null;
}) {
  const t = useT();
  const [sound, setSound] = useState(false);
  useSoundbox(recentPayments ?? [], sound);
  useLiveRefresh({ onChange: () => sound && beep() });

  return (
    <div className="max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t(title)}</h1>
        <div className="flex flex-wrap gap-2">
          <SoundToggle on={sound} setOn={setSound} />
          <Link href="/dashboard/orders/new?type=TAKEAWAY" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            <ShoppingBag size={16} /> {t("floor.takeaway")}
          </Link>
          <Link href="/dashboard/orders/new?type=DELIVERY" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
            <Bike size={16} /> {t("floor.delivery")}
          </Link>
          <Link href="/dashboard/orders/new?channel=ZOMATO" className="inline-flex h-10 items-center rounded-lg bg-[#E23744] px-4 text-sm font-semibold text-white">
            Zomato
          </Link>
          <Link href="/dashboard/orders/new?channel=SWIGGY" className="inline-flex h-10 items-center rounded-lg bg-[#FC8019] px-4 text-sm font-semibold text-white">
            Swiggy
          </Link>
        </div>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-stone-500">{t("floor.salesToday")}</p>
            <p className="text-xl font-semibold">{formatINR(stats.sales)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-stone-500">{t("floor.billsToday")}</p>
            <p className="text-xl font-semibold">{stats.orders}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-stone-500">{t("floor.runningOrders")}</p>
            <p className="text-xl font-semibold">{stats.running}</p>
          </Card>
        </div>
      )}

      {tokens && <PickupStrip tokens={tokens} />}
      <FloorAlerts tables={tables} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          {tables.length ? <TableGrid tables={tables} /> : <p className="text-sm text-stone-500">{t("floor.noTables")}</p>}
          <div className="mt-4 flex gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded ring-2 ring-stone-200" /> {t("floor.free")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand-50 ring-2 ring-brand-500" /> {t("floor.running")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-50 ring-2 ring-amber-400" /> {t("floor.billPrinted")}</span>
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-stone-500">{t("floor.others")}</h2>
          <OtherOrders orders={others} />
        </div>
      </div>
    </div>
  );
}
