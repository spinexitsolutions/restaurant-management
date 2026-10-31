"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { FoodTypeIcon } from "@/components/ui";
import { cn } from "@/lib/utils";
import { beep, useLiveRefresh } from "@/hooks/use-live";
import { kitchenAdvance } from "../orders/actions";
import { useT } from "@/components/i18n";

export interface KitchenKot {
  id: string;
  kotNumber: number;
  createdAt: string;
  note: string | null;
  label: string;
  items: {
    id: string;
    name: string;
    variantName: string | null;
    addons: string[];
    quantity: number;
    foodType: "VEG" | "NON_VEG" | "EGG";
    note: string | null;
    status: "NEW" | "PREPARING" | "READY";
  }[];
}

// Minutes after which a ticket turns amber, then red.
const WARN_AFTER = 10;
const LATE_AFTER = 20;

export function KitchenBoard({ kots, stations, active }: { kots: KitchenKot[]; stations: { id: string; name: string }[]; active: string }) {
  const t = useT();
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  useLiveRefresh({ onChange: () => sound && beep(), intervalMs: 2500 });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const cooking = kots.filter((k) => k.items.some((i) => i.status !== "READY"));
  const ready = kots.flatMap((k) => k.items.filter((i) => i.status === "READY").map((i) => ({ ...i, label: k.label })));

  const advance = (ids: string[], to?: "PREPARING" | "READY") => start(async () => void (await kitchenAdvance(ids, to)));

  return (
    <div className="-m-4 min-h-[calc(100dvh-57px)] bg-stone-950 p-4 text-stone-100 sm:-m-6 lg:-m-8 lg:min-h-dvh lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-semibold tracking-tight">
            {active === "all" ? t("kitchen.title") : active === "main" ? t("kitchen.main") : stations.find((s) => s.id === active)?.name} · {t("kitchen.active", { count: cooking.length })}
          </h1>
          {stations.length > 0 &&
            [{ id: "all", name: t("kitchen.all") }, ...stations, { id: "main", name: t("kitchen.mainShort") }].map((s) => (
              <Link
                key={s.id}
                href={s.id === "all" ? "/dashboard/kitchen" : `/dashboard/kitchen?station=${s.id}`}
                className={cn("rounded-full px-3 py-1 text-sm font-medium", active === s.id ? "bg-white text-stone-900" : "bg-stone-800 text-stone-300 ring-1 ring-stone-700 hover:bg-stone-700")}
              >
                {s.name}
              </Link>
            ))}
        </div>
        <button
          onClick={() => {
            setSound(!sound);
            if (!sound) beep();
          }}
          className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ring-1", sound ? "bg-emerald-600 ring-emerald-500" : "bg-stone-800 ring-stone-700 hover:bg-stone-700")}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? t("kitchen.soundOn") : t("kitchen.turnSoundOn")}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cooking.length === 0 && <p className="col-span-full py-20 text-center text-stone-400">{t("kitchen.empty")}</p>}
          {cooking.map((k) => {
            const mins = Math.floor((now - new Date(k.createdAt).getTime()) / 60000);
            const open = k.items.filter((i) => i.status !== "READY");
            const allNew = open.every((i) => i.status === "NEW");
            return (
              <div key={k.id} className={cn("overflow-hidden rounded-xl border-t-4 bg-stone-900 ring-1 ring-stone-800", mins >= LATE_AFTER ? "border-red-500" : mins >= WARN_AFTER ? "border-amber-400" : "border-emerald-500")}>
                <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2.5 font-semibold">
                  <span>{k.label}</span>
                  <span className="flex items-center gap-2 text-xs font-medium text-stone-400">
                    KOT {k.kotNumber}
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 tabular-nums",
                        mins >= LATE_AFTER ? "bg-red-500/15 text-red-300" : mins >= WARN_AFTER ? "bg-amber-400/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300",
                      )}
                    >
                      {mins}m
                    </span>
                  </span>
                </div>
                <ul className="divide-y divide-stone-800">
                  {k.items.map((i) => (
                    <li key={i.id}>
                      <button
                        disabled={pending || i.status === "READY"}
                        onClick={() => advance([i.id])}
                        className={cn("flex w-full items-start gap-3 px-4 py-3 text-left", i.status === "READY" && "opacity-40", i.status === "PREPARING" && "bg-amber-400/[0.06]")}
                      >
                        <span className="w-7 text-lg font-semibold tabular-nums">{i.quantity}×</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-semibold">
                            <FoodTypeIcon type={i.foodType} /> {i.name}
                          </span>
                          {(i.variantName || i.addons.length > 0) && (
                            <span className="block text-sm text-stone-400">{[i.variantName, ...i.addons].filter(Boolean).join(", ")}</span>
                          )}
                          {i.note && <span className="mt-0.5 flex items-center gap-1.5 text-sm text-amber-300"><AlertTriangle size={14} /> {i.note}</span>}
                        </span>
                        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset", i.status === "NEW" ? "bg-stone-800 text-stone-300 ring-stone-700" : i.status === "PREPARING" ? "bg-amber-400/15 text-amber-300 ring-amber-400/30" : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30")}>
                          {t(`kitchen.badge.${i.status}`)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {k.note && <p className="border-t border-stone-800 px-4 py-2 text-sm text-amber-300">{t("kitchen.note", { note: k.note })}</p>}
                <div className="flex gap-2 border-t border-stone-800 p-3">
                  {allNew && (
                    <button disabled={pending} onClick={() => advance(open.map((i) => i.id), "PREPARING")} className="flex-1 rounded-lg bg-stone-800 py-2 text-sm font-semibold text-stone-100 ring-1 ring-stone-700 hover:bg-stone-700">
                      {t("kitchen.start")}
                    </button>
                  )}
                  <button disabled={pending} onClick={() => advance(open.map((i) => i.id), "READY")} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                    {t("kitchen.allReady")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <aside>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-400 uppercase">{t("kitchen.waiting")}</h2>
          <ul className="space-y-2">
            {ready.length === 0 && <li className="text-sm text-stone-500">{t("kitchen.nothingWaiting")}</li>}
            {ready.map((i) => (
              <li key={i.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm">
                <span className="font-semibold">{i.label}</span> · {i.quantity}× {i.name}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-stone-500">{t("kitchen.help")}</p>
        </aside>
      </div>
    </div>
  );
}
