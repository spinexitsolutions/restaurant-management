"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Minus, Plus, Search, ShoppingBag } from "lucide-react";
import { FoodTypeIcon } from "@/components/ui";
import { Customizer, Sheet } from "@/components/item-customizer";
import { addToCart, buildCartLine, buildWhatsAppOrderText, lineLabel, setQuantity, type CartLine, type MenuItemData } from "@/lib/cart";
import { calculateBill, formatINR } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { placeQrOrder } from "../actions";

export interface MenuData {
  restaurant: {
    slug: string;
    name: string;
    logoUrl: string | null;
    address: string;
    themeColor: string;
    whatsappNumber: string | null;
    qrOrderingEnabled: boolean;
    gstEnabled: boolean;
    gstMode: "INCLUSIVE" | "EXCLUSIVE";
    serviceChargeRate: number;
  };
  table: string | null;
  tableToken: string | null;
  categories: { id: string; name: string; items: MenuItemData[] }[];
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function activeOrderKey(slug: string, tableToken: string) {
  return `order:${slug}:${tableToken}`;
}

/** Token of the order this phone placed at this table, so the customer can get back to tracking. */
function useActiveOrder(slug: string, tableToken: string | null) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!tableToken) return;
    try {
      setToken(localStorage.getItem(activeOrderKey(slug, tableToken)));
    } catch {}
  }, [slug, tableToken]);
  return token;
}

function useStoredCart(key: string) {
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setCart(JSON.parse(saved));
    } catch {
      // Storage may be unavailable (private mode); the cart just won't persist.
    }
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {}
  }, [key, cart]);
  return [cart, setCart] as const;
}

export function MenuApp({ data }: { data: MenuData }) {
  const { restaurant, table } = data;
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [activeCat, setActiveCat] = useState(data.categories[0]?.id);
  const [customizing, setCustomizing] = useState<MenuItemData | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useStoredCart(`cart:${restaurant.slug}`);
  const activeOrder = useActiveOrder(restaurant.slug, data.tableToken);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) => (!vegOnly || i.foodType === "VEG") && (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [data.categories, query, vegOnly]);

  const qtyByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity);
    return m;
  }, [cart]);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
  const bill = useMemo(
    () =>
      calculateBill(
        cart.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.gstRate })),
        { gstEnabled: restaurant.gstEnabled, mode: restaurant.gstMode, serviceChargeRate: restaurant.serviceChargeRate },
      ),
    [cart, restaurant],
  );

  // Highlight the category currently on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveCat(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -70% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  function quickAdd(item: MenuItemData) {
    if (item.variants.length || item.addonGroups.length) setCustomizing(item);
    else setCart((c) => addToCart(c, buildCartLine(item, null, [])));
  }

  function decrement(item: MenuItemData) {
    // Remove from the most recently added line for this item.
    const line = [...cart].reverse().find((l) => l.itemId === item.id);
    if (line) setCart((c) => setQuantity(c, line.key, line.quantity - 1));
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white pb-28" style={{ "--theme": restaurant.themeColor } as React.CSSProperties}>
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          {restaurant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{restaurant.name}</h1>
            {restaurant.address && <p className="truncate text-sm text-stone-500">{restaurant.address}</p>}
          </div>
        </div>
        {table && (
          <p className="mt-3 inline-block rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: "var(--theme)" }}>
            Table {table}
          </p>
        )}
        {activeOrder && (
          <Link href={`/m/${restaurant.slug}/o/${activeOrder}`} className="mt-3 ml-2 inline-block rounded-full bg-stone-900 px-3 py-1 text-sm font-semibold text-white">
            Track your order →
          </Link>
        )}
      </header>

      <div className="sticky top-0 z-20 border-b border-stone-100 bg-white/95 backdrop-blur">
        <div className="flex gap-2 px-4 pt-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes"
              className="h-10 w-full rounded-full bg-stone-100 pr-3 pl-9 text-sm outline-none"
            />
          </div>
          <button
            onClick={() => setVegOnly((v) => !v)}
            className={cn("flex h-10 items-center gap-2 rounded-full border px-3 text-sm", vegOnly ? "border-green-600 bg-green-50 text-green-700" : "border-stone-200")}
            aria-pressed={vegOnly}
          >
            <FoodTypeIcon type="VEG" /> Veg
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => sectionRefs.current[c.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", activeCat === c.id ? "text-white" : "bg-stone-100 text-stone-700")}
              style={activeCat === c.id ? { background: "var(--theme)" } : undefined}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </div>

      <main className="px-4">
        {categories.length === 0 && <p className="py-16 text-center text-stone-500">No dishes found.</p>}
        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} ref={(el) => void (sectionRefs.current[c.id] = el)} className="scroll-mt-28 pt-6">
            <h2 className="mb-2 text-lg font-bold">{c.name}</h2>
            <ul className="divide-y divide-stone-100">
              {c.items.map((item) => (
                <MenuItemRow key={item.id} item={item} qty={qtyByItem.get(item.id) ?? 0} onAdd={() => quickAdd(item)} onRemove={() => decrement(item)} />
              ))}
            </ul>
          </section>
        ))}
        <p className="py-8 text-center text-xs text-stone-400">
          {restaurant.gstEnabled ? (restaurant.gstMode === "INCLUSIVE" ? "Prices include GST" : "Prices exclude GST") : ""}
        </p>
      </main>

      {itemCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl p-3">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-white shadow-lg"
            style={{ background: "var(--theme)" }}
          >
            <span className="text-sm font-medium">
              {itemCount} item{itemCount > 1 ? "s" : ""} · {rupees(bill.grandTotal)}
            </span>
            <span className="flex items-center gap-2 font-semibold">
              View cart <ShoppingBag size={18} />
            </span>
          </button>
        </div>
      )}

      {customizing && (
        <Customizer
          item={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={(line) => {
            setCart((c) => addToCart(c, line));
            setCustomizing(null);
          }}
        />
      )}

      {cartOpen && <CartSheet data={data} cart={cart} setCart={setCart} bill={bill} onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function MenuItemRow({ item, qty, onAdd, onRemove }: { item: MenuItemData; qty: number; onAdd: () => void; onRemove: () => void }) {
  const fromPrice = item.variants.length ? Math.min(...item.variants.map((v) => v.price)) : item.price;
  return (
    <li className={cn("flex gap-4 py-4", !item.isAvailable && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <FoodTypeIcon type={item.foodType} />
          {item.isBestseller && <span className="text-xs font-semibold text-amber-600">★ Bestseller</span>}
        </div>
        <h3 className="mt-1 font-semibold">{item.name}</h3>
        <p className="text-sm font-medium">
          {item.variants.length > 1 && <span className="text-stone-500">from </span>}
          {rupees(fromPrice)}
          {item.spiceLevel > 0 && <span className="ml-2">{"🌶️".repeat(item.spiceLevel)}</span>}
        </p>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-stone-500">{item.description}</p>}
      </div>
      <div className="relative flex w-28 shrink-0 flex-col items-center">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-24 w-28 rounded-xl object-cover" loading="lazy" />
        ) : (
          <div className="h-10" />
        )}
        <div className={cn(item.imageUrl && "-mt-5")}>
          {!item.isAvailable ? (
            <span className="block rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-500">Sold out</span>
          ) : qty === 0 ? (
            <button
              onClick={onAdd}
              className="rounded-lg border border-stone-200 bg-white px-6 py-1.5 text-sm font-bold shadow-sm"
              style={{ color: "var(--theme)" }}
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center rounded-lg text-white shadow-sm" style={{ background: "var(--theme)" }}>
              <button onClick={onRemove} className="px-2.5 py-1.5" aria-label="Remove one">
                <Minus size={14} />
              </button>
              <span className="min-w-6 text-center text-sm font-bold">{qty}</span>
              <button onClick={onAdd} className="px-2.5 py-1.5" aria-label="Add one">
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
        {(item.variants.length > 0 || item.addonGroups.length > 0) && item.isAvailable && (
          <span className="mt-1 text-[10px] text-stone-400">customisable</span>
        )}
      </div>
    </li>
  );
}

function CartSheet({
  data,
  cart,
  setCart,
  bill,
  onClose,
}: {
  data: MenuData;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  bill: ReturnType<typeof calculateBill>;
  onClose: () => void;
}) {
  const { restaurant, table, tableToken } = data;
  const router = useRouter();
  const [placing, startPlacing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const itemTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  // With inclusive pricing (and no service charge) GST is already inside the item total.
  const inclusive = restaurant.gstMode === "INCLUSIVE" && bill.serviceCharge === 0;

  function orderOnWhatsApp() {
    if (!restaurant.whatsappNumber) return;
    const text = buildWhatsAppOrderText({
      restaurantName: restaurant.name,
      table,
      customerName: name.trim(),
      note: note.trim(),
      lines: cart,
      totalLabel: `Total: ${formatINR(bill.grandTotal)}${restaurant.gstEnabled ? " (incl. GST)" : ""}`,
      formatPrice: formatINR,
    });
    window.open(`https://wa.me/91${restaurant.whatsappNumber}?text=${encodeURIComponent(text)}`, "_blank");
  }

  const canPlace = restaurant.qrOrderingEnabled && !!tableToken;

  function placeOrder() {
    if (!tableToken) return;
    setError(null);
    startPlacing(async () => {
      const res = await placeQrOrder({
        slug: restaurant.slug,
        tableToken,
        customerName: name.trim() || undefined,
        note: note.trim() || undefined,
        lines: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId, addonIds: l.addonIds, quantity: l.quantity })),
      });
      if (!res.ok) return setError(res.error);
      try {
        localStorage.setItem(activeOrderKey(restaurant.slug, tableToken), res.data.token);
      } catch {}
      setCart([]);
      router.push(`/m/${restaurant.slug}/o/${res.data.token}`);
    });
  }

  return (
    <Sheet
      title={table ? `Your order · Table ${table}` : "Your order"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {canPlace && (
            <button
              onClick={placeOrder}
              disabled={cart.length === 0 || placing}
              className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--theme)" }}
            >
              {placing ? "Placing order..." : `Place order · ${rupees(bill.grandTotal)}`}
            </button>
          )}
          {restaurant.whatsappNumber && (
            <button
              onClick={orderOnWhatsApp}
              disabled={cart.length === 0}
              className={cn("w-full rounded-lg py-3 font-semibold disabled:opacity-50", canPlace ? "text-[#128C7E] ring-1 ring-[#25D366]" : "bg-[#25D366] text-white")}
            >
              Order on WhatsApp{!canPlace && ` · ${rupees(bill.grandTotal)}`}
            </button>
          )}
          {!canPlace && !restaurant.whatsappNumber && <p className="text-center text-sm text-stone-500">Show this order to your waiter.</p>}
        </div>
      }
    >
      {cart.length === 0 ? (
        <p className="py-10 text-center text-stone-500">Your cart is empty.</p>
      ) : (
        <>
          <ul className="divide-y divide-stone-100">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{lineLabel(l)}</p>
                  <p className="text-sm text-stone-500">{rupees(l.unitPrice)}</p>
                </div>
                <div className="flex items-center rounded-lg border border-stone-200">
                  <button onClick={() => setCart((c) => setQuantity(c, l.key, l.quantity - 1))} className="px-2 py-1" aria-label="Decrease">
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                  <button onClick={() => setCart((c) => setQuantity(c, l.key, l.quantity + 1))} className="px-2 py-1" aria-label="Increase">
                    <Plus size={14} />
                  </button>
                </div>
                <p className="w-20 text-right text-sm font-medium">{rupees(l.unitPrice * l.quantity)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="h-10 w-full rounded-lg border border-stone-200 px-3 text-sm" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cooking instructions, e.g. less spicy" rows={2} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
          </div>

          <dl className="mt-4 space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
            <BillRow label="Item total" value={formatINR(itemTotal)} />
            {bill.serviceCharge > 0 && <BillRow label="Service charge" value={formatINR(bill.serviceCharge)} />}
            {bill.totalTax > 0 &&
              (inclusive ? (
                <p className="text-xs text-stone-500">Includes GST of {formatINR(bill.totalTax)}</p>
              ) : (
                <>
                  <BillRow label="CGST" value={formatINR(bill.cgst)} />
                  <BillRow label="SGST" value={formatINR(bill.sgst)} />
                </>
              ))}
            {bill.roundOff !== 0 && <BillRow label="Round off" value={formatINR(bill.roundOff)} />}
            <div className="border-t border-stone-200 pt-1 font-bold">
              <BillRow label="To pay" value={formatINR(bill.grandTotal)} />
            </div>
          </dl>
        </>
      )}
    </Sheet>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
