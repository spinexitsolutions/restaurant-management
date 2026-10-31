"use client";

import { useEffect, useRef, useState } from "react";
import { History, Plus, Star, X } from "lucide-react";
import { FoodTypeIcon } from "@/components/ui";
import { Sheet } from "@/components/item-customizer";
import { buildCartLine, type CartLine, type MenuItemData } from "@/lib/cart";
import { parseVideoUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function RatingBadge({ rating, className }: { rating: MenuItemData["rating"]; className?: string }) {
  if (!rating) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded bg-green-700 px-1.5 py-0.5 text-[11px] font-semibold text-white", className)}>
      {rating.average.toFixed(1)} <Star size={10} fill="currentColor" /> <span className="font-normal opacity-80">({rating.count})</span>
    </span>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const v = parseVideoUrl(url);
  if (!v) return null;
  return v.type === "youtube" ? (
    <iframe
      className="aspect-video w-full rounded-xl"
      src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`}
      title="Dish video"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  ) : (
    <video className="aspect-video w-full rounded-xl bg-black" src={v.url} controls playsInline preload="metadata" />
  );
}

/** Full view of a dish: photos, video, description, rating and what goes well with it. */
export function ItemDetail({
  item,
  byId,
  onClose,
  onAdd,
}: {
  item: MenuItemData;
  byId: Map<string, MenuItemData>;
  onClose: () => void;
  onAdd: (item: MenuItemData) => void;
}) {
  const photos = [item.imageUrl, ...(item.media ?? []).filter((m) => m.kind === "IMAGE").map((m) => m.url)].filter((x): x is string => !!x);
  const video = item.media?.find((m) => m.kind === "VIDEO")?.url;
  const [index, setIndex] = useState(0);
  const pairs = (item.suggestions ?? []).map((id) => byId.get(id)).filter((x): x is MenuItemData => !!x && x.isAvailable);
  const fromPrice = item.variants.length ? Math.min(...item.variants.map((v) => v.price)) : item.price;

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        item.isAvailable ? (
          <button onClick={() => onAdd(item)} className="w-full rounded-lg py-3 font-semibold text-white" style={{ background: "var(--theme)" }}>
            Add · {item.variants.length > 1 ? "from " : ""}
            {rupees(fromPrice)}
          </button>
        ) : (
          <p className="text-center text-sm text-stone-500">Sold out right now</p>
        )
      }
    >
      {photos.length > 0 && (
        <div className="mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[index]} alt={item.name} className="aspect-[4/3] w-full rounded-xl object-cover" />
          {photos.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button key={p + i} onClick={() => setIndex(i)} className={cn("shrink-0 overflow-hidden rounded-lg ring-2", i === index ? "ring-[var(--theme)]" : "ring-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="h-14 w-14 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <FoodTypeIcon type={item.foodType} />
        {item.isBestseller && <span className="text-xs font-semibold text-amber-600">★ Bestseller</span>}
        {item.isKidsFriendly && <span className="rounded bg-sky-100 px-1.5 text-xs font-semibold text-sky-800">Kids</span>}
        <RatingBadge rating={item.rating} />
        {item.spiceLevel > 0 && <span className="text-sm">{"🌶️".repeat(item.spiceLevel)}</span>}
      </div>
      {item.description && <p className="mb-3 text-sm text-stone-600">{item.description}</p>}
      {video && (
        <div className="mb-4">
          <VideoPlayer url={video} />
        </div>
      )}
      {pairs.length > 0 && (
        <div className="mb-2">
          <p className="mb-2 text-sm font-semibold">Goes well with</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pairs.map((p) => (
              <SuggestionCard key={p.id} item={p} onAdd={() => onAdd(p)} />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function SuggestionCard({ item, onAdd }: { item: MenuItemData; onAdd: () => void }) {
  return (
    <div className="flex w-36 shrink-0 flex-col rounded-xl p-2 ring-1 ring-stone-200">
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="mb-1 h-16 w-full rounded-lg object-cover" />
      ) : null}
      <span className="flex items-start gap-1 text-xs leading-tight font-medium">
        <FoodTypeIcon type={item.foodType} /> {item.name}
      </span>
      <span className="mt-auto flex items-center justify-between pt-1 text-xs">
        {rupees(item.variants[0]?.price ?? item.price)}
        <button onClick={onAdd} className="rounded-md px-2 py-0.5 font-bold ring-1 ring-stone-200" style={{ color: "var(--theme)" }} aria-label={`Add ${item.name}`}>
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/** Slides up after something is added: dishes that go well with it and aren't in the cart yet. */
export function UpsellStrip({ forItem, byId, cart, onAdd, onClose }: { forItem: MenuItemData; byId: Map<string, MenuItemData>; cart: CartLine[]; onAdd: (i: MenuItemData) => void; onClose: () => void }) {
  const inCart = new Set(cart.map((l) => l.itemId));
  const picks = (forItem.suggestions ?? []).map((id) => byId.get(id)).filter((x): x is MenuItemData => !!x && x.isAvailable && !inCart.has(x.id));
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => close.current(), 10000);
    return () => clearTimeout(t);
  }, [forItem.id]);
  if (!picks.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-[72px] z-30 mx-auto max-w-2xl px-3">
      <div className="rounded-xl bg-white p-3 shadow-lg ring-1 ring-stone-200">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Goes well with {forItem.name}</p>
          <button onClick={onClose} aria-label="Close suggestions" className="text-stone-400">
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {picks.map((p) => (
            <SuggestionCard key={p.id} item={p} onAdd={() => onAdd(p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface SavedOrder {
  at: string;
  lines: { itemId: string; variantId: string | null; addonIds: string[]; quantity: number; name: string }[];
}

const lastKey = (slug: string) => `last-order:${slug}`;

/** Remembers what this phone ordered, so next visit it can be added again in one tap. */
export function saveLastOrder(slug: string, cart: CartLine[]) {
  try {
    const saved: SavedOrder = { at: new Date().toISOString(), lines: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId, addonIds: l.addonIds, quantity: l.quantity, name: l.name })) };
    localStorage.setItem(lastKey(slug), JSON.stringify(saved));
  } catch {}
}

export function LastOrderBanner({ slug, byId, onAddAll }: { slug: string; byId: Map<string, MenuItemData>; onAddAll: (lines: CartLine[], skipped: number) => void }) {
  const [saved, setSaved] = useState<SavedOrder | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastKey(slug));
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [slug]);
  if (!saved?.lines.length) return null;

  function addAll() {
    const lines: CartLine[] = [];
    let skipped = 0;
    for (const s of saved!.lines) {
      const item = byId.get(s.itemId);
      // Skip dishes that were removed, sold out, or whose size no longer exists.
      if (!item || !item.isAvailable || (item.variants.length > 0 && !item.variants.some((v) => v.id === s.variantId))) {
        skipped++;
        continue;
      }
      const validAddons = s.addonIds.filter((id) => item.addonGroups.some((g) => g.options.some((o) => o.id === id)));
      lines.push({ ...buildCartLine(item, s.variantId, validAddons), quantity: s.quantity });
    }
    onAddAll(lines, skipped);
    setSaved(null);
  }

  const when = new Date(saved.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const summary = saved.lines.map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.name}`).join(", ");
  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
      <History size={18} className="shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-amber-800">Your last order · {when}</p>
        <p className="truncate text-sm font-medium">{summary}</p>
      </div>
      <button onClick={addAll} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: "var(--theme)" }}>
        Order again
      </button>
    </div>
  );
}
