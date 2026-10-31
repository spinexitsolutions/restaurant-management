"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { buildCartLine, validateAddons, type CartLine, type MenuItemData } from "@/lib/cart";

// Bottom sheet + item customisation (variant, add-ons, quantity), shared by the customer
// menu and the staff order screen. Colours come from the --theme CSS variable.

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-stone-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        <div className="border-t border-stone-100 p-3">{footer}</div>
      </div>
    </div>
  );
}

export function Customizer({ item, onClose, onAdd }: { item: MenuItemData; onClose: () => void; onAdd: (line: CartLine) => void }) {
  const [variantId, setVariantId] = useState<string | null>(item.variants[0]?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const line = buildCartLine(item, variantId, addonIds);
  const error = validateAddons(item, addonIds);

  function toggle(groupId: string, optionId: string) {
    const group = item.addonGroups.find((g) => g.id === groupId)!;
    const groupIds = group.options.map((o) => o.id);
    setAddonIds((ids) => {
      if (ids.includes(optionId)) return ids.filter((x) => x !== optionId);
      // Single-choice groups behave like radio buttons.
      if (group.maxSelect === 1) return [...ids.filter((x) => !groupIds.includes(x)), optionId];
      const selected = ids.filter((x) => groupIds.includes(x)).length;
      return selected >= group.maxSelect ? ids : [...ids, optionId];
    });
  }

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <div className="flex items-center rounded-lg border border-stone-200">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2" aria-label="Decrease">
              <Minus size={16} />
            </button>
            <span className="w-6 text-center font-semibold">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2" aria-label="Increase">
              <Plus size={16} />
            </button>
          </div>
          <button
            disabled={!!error}
            onClick={() => onAdd({ ...line, quantity: qty })}
            className="flex-1 rounded-lg py-2.5 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--theme)" }}
          >
            {error ?? `Add item · ${rupees(line.unitPrice * qty)}`}
          </button>
        </div>
      }
    >
      {item.variants.length > 0 && (
        <fieldset className="mb-5">
          <legend className="mb-2 font-semibold">Choose size</legend>
          {item.variants.map((v) => (
            <label key={v.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-3">
                <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} className="h-4 w-4" style={{ accentColor: "var(--theme)" }} />
                {v.name}
              </span>
              <span className="text-sm">{rupees(v.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {item.addonGroups.map((g) => (
        <fieldset key={g.id} className="mb-5">
          <legend className="flex w-full items-center justify-between font-semibold">
            {g.name}
            <GroupProgress chosen={g.options.filter((o) => addonIds.includes(o.id)).length} min={g.minSelect} max={g.maxSelect} />
          </legend>
          <p className="mb-2 text-xs text-stone-500">
            {g.minSelect > 0 ? (g.minSelect === g.maxSelect ? `Choose ${g.minSelect}` : `Choose ${g.minSelect} to ${g.maxSelect}`) : g.maxSelect === 1 ? "Optional · choose 1" : `Optional · up to ${g.maxSelect}`}
          </p>
          {g.options.map((o) => (
            <label key={o.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-3">
                <input
                  type={g.maxSelect === 1 ? "radio" : "checkbox"}
                  checked={addonIds.includes(o.id)}
                  onChange={() => toggle(g.id, o.id)}
                  onClick={(e) => {
                    // Allow un-selecting an optional radio choice.
                    if (g.maxSelect === 1 && addonIds.includes(o.id)) {
                      e.preventDefault();
                      toggle(g.id, o.id);
                    }
                  }}
                  className="h-4 w-4"
                  style={{ accentColor: "var(--theme)" }}
                />
                {o.name}
              </span>
              <span className="text-sm">{o.price ? `+ ${rupees(o.price)}` : "Free"}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </Sheet>
  );
}


/** "1/2 chosen" while a required group is incomplete, a tick when it's done. */
function GroupProgress({ chosen, min, max }: { chosen: number; min: number; max: number }) {
  if (min === 0) return chosen ? <span className="text-xs font-normal text-stone-500">{chosen} added</span> : null;
  const done = chosen >= min;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${done ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
      {done ? "✓ " : ""}
      {chosen}/{min === max ? min : `${min}+`} chosen
    </span>
  );
}
