"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { buildCartLine, type CartLine, type MenuItemData } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { Customizer } from "./item-customizer";
import { FoodTypeIcon } from "./ui";
import { useT } from "./i18n";

export interface PickerCategory {
  id: string;
  name: string;
  items: MenuItemData[];
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Fast item grid for staff: tap to add, items with options open the customiser. */
export function MenuPicker({ categories, onAdd }: { categories: PickerCategory[]; onAdd: (line: CartLine) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const [customizing, setCustomizing] = useState<MenuItemData | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = cat === "all" || q ? categories.flatMap((c) => c.items) : categories.find((c) => c.id === cat)?.items ?? [];
    return q ? pool.filter((i) => i.name.toLowerCase().includes(q)) : pool;
  }, [categories, cat, query]);

  function pick(item: MenuItemData) {
    if (!item.isAvailable) return;
    if (item.variants.length || item.addonGroups.length) setCustomizing(item);
    else onAdd(buildCartLine(item, null, []));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-2">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("menu.search")}
          className="h-10 w-full rounded-lg border border-stone-300 bg-white pr-3 pl-9 text-sm outline-none focus:border-brand-500"
          autoComplete="off"
        />
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {[{ id: "all", name: t("menu.all") }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", cat === c.id ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200")}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => pick(item)}
            disabled={!item.isAvailable}
            className="flex min-h-20 flex-col justify-between rounded-lg bg-white p-3 text-left ring-1 ring-stone-200 hover:ring-brand-500 active:bg-brand-50 disabled:opacity-40"
          >
            <span className="flex items-start gap-1.5 text-sm leading-tight font-medium">
              <span className="mt-0.5">
                <FoodTypeIcon type={item.foodType} />
              </span>
              {item.name}
            </span>
            <span className="mt-1 text-xs text-stone-500">
              {item.isAvailable ? rupees(item.variants[0]?.price ?? item.price) : t("menu.soldOut")}
              {item.isAvailable && (item.variants.length > 1 || item.addonGroups.length > 0) && " +"}
            </span>
          </button>
        ))}
        {items.length === 0 && <p className="col-span-full py-10 text-center text-sm text-stone-500">{t("menu.noItems")}</p>}
      </div>
      {customizing && (
        <div style={{ "--theme": "#ea580c" } as React.CSSProperties}>
          <Customizer
            item={customizing}
            onClose={() => setCustomizing(null)}
            onAdd={(line) => {
              onAdd(line);
              setCustomizing(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
