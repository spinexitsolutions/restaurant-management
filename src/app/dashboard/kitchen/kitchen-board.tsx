"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { FoodTypeIcon } from "@/components/ui";
import { cn } from "@/lib/utils";
import { beep, useLiveRefresh } from "@/hooks/use-live";
import { kitchenAdvance } from "../orders/actions";

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
    <div className="-m-4 min-h-[calc(100dvh-57px)] bg-stone-900 p-4 text-stone-100 sm:-m-6 lg:-m-8 lg:min-h-dvh lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-bold">
            {active === "all" ? "Kitchen" : active === "main" ? "Main kitchen" : stations.find((s) => s.id === active)?.name} · {cooking.length} active
          </h1>
          {stations.length > 0 &&
            [{ id: "all", name: "All" }, ...stations, { id: "main", name: "Main" }].map((s) => (
              <Link
                key={s.id}
                href={s.id === "all" ? "/dashboard/kitchen" : `/dashboard/kitchen?station=${s.id}`}
                className={cn("rounded-full px-3 py-1 text-sm font-medium", active === s.id ? "bg-white text-stone-900" : "bg-stone-700 text-stone-200")}
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
          className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", sound ? "bg-green-600" : "bg-stone-700")}
        >
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? "Sound on" : "Turn sound on"}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <div className="grid auto-rows-min gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {cooking.length === 0 && <p className="col-span-full py-20 text-center text-stone-400">No pending orders. 👨‍🍳</p>}
          {cooking.map((k) => {
            const mins = Math.floor((now - new Date(k.createdAt).getTime()) / 60000);
            const open = k.items.filter((i) => i.status !== "READY");
            const allNew = open.every((i) => i.status === "NEW");
            return (
              <div key={k.id} className="overflow-hidden rounded-xl bg-stone-800">
                <div className={cn("flex items-center justify-between px-4 py-2 font-bold", mins >= LATE_AFTER ? "bg-red-600" : mins >= WARN_AFTER ? "bg-amber-500 text-stone-900" : "bg-green-600")}>
                  <span>{k.label}</span>
                  <span className="text-sm">
                    KOT {k.kotNumber} · {mins}m
                  </span>
                </div>
                <ul className="divide-y divide-stone-700">
                  {k.items.map((i) => (
                    <li key={i.id}>
                      <button
                        disabled={pending || i.status === "READY"}
                        onClick={() => advance([i.id])}
                        className={cn("flex w-full items-start gap-3 px-4 py-3 text-left", i.status === "READY" && "opacity-40", i.status === "PREPARING" && "bg-amber-500/10")}
                      >
                        <span className="text-lg font-bold">{i.quantity}×</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-semibold">
                            <FoodTypeIcon type={i.foodType} /> {i.name}
                          </span>
                          {(i.variantName || i.addons.length > 0) && (
                            <span className="block text-sm text-stone-400">{[i.variantName, ...i.addons].filter(Boolean).join(", ")}</span>
                          )}
                          {i.note && <span className="block text-sm text-amber-300">⚠ {i.note}</span>}
                        </span>
                        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", i.status === "NEW" ? "bg-stone-600" : i.status === "PREPARING" ? "bg-amber-500 text-stone-900" : "bg-green-600")}>
                          {i.status === "NEW" ? "NEW" : i.status === "PREPARING" ? "COOKING" : "READY"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {k.note && <p className="border-t border-stone-700 px-4 py-2 text-sm text-amber-300">Note: {k.note}</p>}
                <div className="flex gap-2 p-3">
                  {allNew && (
                    <button disabled={pending} onClick={() => advance(open.map((i) => i.id), "PREPARING")} className="flex-1 rounded-lg bg-amber-500 py-2 font-semibold text-stone-900">
                      Start cooking
                    </button>
                  )}
                  <button disabled={pending} onClick={() => advance(open.map((i) => i.id), "READY")} className="flex-1 rounded-lg bg-green-600 py-2 font-semibold">
                    All ready
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <aside>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-400 uppercase">Ready · waiting for pickup</h2>
          <ul className="space-y-2">
            {ready.length === 0 && <li className="text-sm text-stone-500">Nothing waiting.</li>}
            {ready.map((i) => (
              <li key={i.id} className="rounded-lg bg-green-900/40 px-3 py-2 text-sm">
                <span className="font-semibold">{i.label}</span> · {i.quantity}× {i.name}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-stone-500">Tap an item: New → Cooking → Ready. Waiters see ready items instantly.</p>
        </aside>
      </div>
    </div>
  );
}
