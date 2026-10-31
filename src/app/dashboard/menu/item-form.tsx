"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { saveItem, type ItemInput } from "./actions";
import { ImageUpload } from "@/components/image-upload";

type Variant = { name: string; price: string };
type AddonOption = { name: string; price: string };
type AddonGroup = { name: string; minSelect: string; maxSelect: string; options: AddonOption[] };

// Build-your-own thali: required picks are free, extras cost more. Owners edit names and prices.
const THALI_TEMPLATE: AddonGroup[] = [
  { name: "Choose 2 sabzi", minSelect: "2", maxSelect: "2", options: ["Paneer Butter Masala", "Mix Veg", "Aloo Gobi", "Bhindi Masala"].map((name) => ({ name, price: "" })) },
  { name: "Choose dal", minSelect: "1", maxSelect: "1", options: ["Dal Tadka", "Dal Makhani"].map((name) => ({ name, price: "" })) },
  { name: "Choose bread", minSelect: "1", maxSelect: "1", options: ["4 Tawa Roti", "2 Butter Naan"].map((name) => ({ name, price: "" })) },
  { name: "Add extras", minSelect: "0", maxSelect: "3", options: [{ name: "Jeera Rice", price: "40" }, { name: "Gulab Jamun", price: "30" }, { name: "Salad", price: "20" }] },
];

export interface ItemFormValues {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  foodType: "VEG" | "NON_VEG" | "EGG";
  gstRate: string;
  isAvailable: boolean;
  isBestseller: boolean;
  isKidsFriendly: boolean;
  gallery: string[];
  videoUrl: string;
  pairsWith: string[];
  spiceLevel: string;
  stationId: string;
  prepTimeMinutes: string;
  variants: Variant[];
  addonGroups: AddonGroup[];
}

export function ItemForm({
  initial,
  categories,
  defaultGstRate,
  stations,
  otherItems,
}: {
  initial: ItemFormValues;
  categories: { id: string; name: string }[];
  defaultGstRate: string;
  stations: { id: string; name: string }[];
  otherItems: { id: string; name: string }[];
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => setV((prev) => ({ ...prev, [key]: value }));

  const updateVariant = (i: number, patch: Partial<Variant>) =>
    set("variants", v.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateGroup = (i: number, patch: Partial<AddonGroup>) =>
    set("addonGroups", v.addonGroups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const updateOption = (gi: number, oi: number, patch: Partial<AddonOption>) =>
    updateGroup(gi, { options: v.addonGroups[gi].options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: ItemInput = {
      ...v,
      price: v.price || "0",
      spiceLevel: v.spiceLevel,
      variants: v.variants,
      addonGroups: v.addonGroups,
    };
    start(async () => {
      const res = await saveItem(payload);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="font-semibold">Basic details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name">
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={80} />
          </Field>
          <Field label="Category">
            <Select value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" hint="Shown on the customer menu">
          <Textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={300} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (₹)" hint={v.variants.length ? "Variants below set the price" : undefined}>
            <Input type="number" min={0} step="0.01" value={v.price} onChange={(e) => set("price", e.target.value)} disabled={v.variants.length > 0} required={!v.variants.length} />
          </Field>
          <Field label="Food type">
            <Select value={v.foodType} onChange={(e) => set("foodType", e.target.value as ItemFormValues["foodType"])}>
              <option value="VEG">🟢 Veg</option>
              <option value="NON_VEG">🔴 Non-veg</option>
              <option value="EGG">🟡 Contains egg</option>
            </Select>
          </Field>
          <Field label="GST rate (%)" hint={`Leave blank to use default (${defaultGstRate}%)`}>
            <Input type="number" min={0} max={28} step="0.01" value={v.gstRate} onChange={(e) => set("gstRate", e.target.value)} placeholder={defaultGstRate} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Spice level">
            <Select value={v.spiceLevel} onChange={(e) => set("spiceLevel", e.target.value)}>
              <option value="0">Not spicy</option>
              <option value="1">🌶️ Mild</option>
              <option value="2">🌶️🌶️ Medium</option>
              <option value="3">🌶️🌶️🌶️ Hot</option>
            </Select>
          </Field>
          {stations.length > 0 && (
            <Field label="Kitchen station" hint="Leave as category default unless this dish is made elsewhere">
              <Select value={v.stationId} onChange={(e) => set("stationId", e.target.value)}>
                <option value="">Same as category</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Prep time (minutes)">
            <Input type="number" min={1} max={240} value={v.prepTimeMinutes} onChange={(e) => set("prepTimeMinutes", e.target.value)} />
          </Field>

        </div>
        <Field label="Photo">
          <ImageUpload value={v.imageUrl} onChange={(url) => set("imageUrl", url)} />
        </Field>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.isAvailable} onChange={(e) => set("isAvailable", e.target.checked)} />
            Available (in stock)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.isBestseller} onChange={(e) => set("isBestseller", e.target.checked)} />
            Mark as bestseller
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={v.isKidsFriendly} onChange={(e) => set("isKidsFriendly", e.target.checked)} />
            Kids friendly
          </label>
        </div>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">More photos &amp; video</h2>
          <p className="text-sm text-stone-500">Shown when a customer taps the dish. Good photos sell more.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {v.gallery.map((url, i) => (
            <ImageUpload key={`${i}-${url}`} value={url} onChange={(u) => set("gallery", u ? v.gallery.map((x, j) => (j === i ? u : x)) : v.gallery.filter((_, j) => j !== i))} />
          ))}
          {v.gallery.length < 4 && <ImageUpload key={`new-${v.gallery.length}`} value="" label="Add photo" onChange={(u) => u && set("gallery", [...v.gallery, u])} />}
        </div>
        <Field label="Video link (optional)" hint="YouTube link, or an https link to an .mp4 file">
          <Input value={v.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtu.be/..." />
        </Field>
      </Card>

      {otherItems.length > 0 && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Goes well with</h2>
            <p className="text-sm text-stone-500">
              Suggested to the customer after they add this dish (up to 6). Dishes often ordered together are suggested automatically too.
            </p>
          </div>
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {otherItems.map((o) => {
              const on = v.pairsWith.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => set("pairsWith", on ? v.pairsWith.filter((x) => x !== o.id) : [...v.pairsWith, o.id].slice(0, 6))}
                  className={`rounded-full px-3 py-1 text-sm ring-1 ${on ? "bg-brand-50 font-medium text-brand-700 ring-brand-500" : "ring-stone-200"}`}
                >
                  {on ? "✓ " : ""}
                  {o.name}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Variants</h2>
            <p className="text-sm text-stone-500">Sizes or portions like Half / Full. Customer picks exactly one.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => set("variants", [...v.variants, { name: "", price: "" }])}>
            <Plus size={14} /> Variant
          </Button>
        </div>
        {v.variants.map((variant, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder="Half" value={variant.name} onChange={(e) => updateVariant(i, { name: e.target.value })} required />
            <Input className="w-32" type="number" min={0} step="0.01" placeholder="₹" value={variant.price} onChange={(e) => updateVariant(i, { price: e.target.value })} required />
            <Button type="button" variant="ghost" onClick={() => set("variants", v.variants.filter((_, j) => j !== i))} aria-label="Remove variant">
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Add-ons</h2>
            <p className="text-sm text-stone-500">Extras like &ldquo;Extra cheese&rdquo; or &ldquo;Choose your dip&rdquo;.</p>
          </div>
          <div className="flex gap-2">
            {v.addonGroups.length === 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => set("addonGroups", THALI_TEMPLATE)} title="Pre-fill choices for a build-your-own thali">
                Thali template
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => set("addonGroups", [...v.addonGroups, { name: "", minSelect: "0", maxSelect: "1", options: [{ name: "", price: "" }] }])}
            >
              <Plus size={14} /> Add-on group
            </Button>
          </div>
        </div>
        {v.addonGroups.map((g, gi) => (
          <div key={gi} className="space-y-3 rounded-lg border border-stone-200 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Field label="Group name">
                  <Input placeholder="Extra toppings" value={g.name} onChange={(e) => updateGroup(gi, { name: e.target.value })} required />
                </Field>
              </div>
              <div className="w-24">
                <Field label="Min">
                  <Input type="number" min={0} value={g.minSelect} onChange={(e) => updateGroup(gi, { minSelect: e.target.value })} />
                </Field>
              </div>
              <div className="w-24">
                <Field label="Max">
                  <Input type="number" min={1} value={g.maxSelect} onChange={(e) => updateGroup(gi, { maxSelect: e.target.value })} />
                </Field>
              </div>
              <Button type="button" variant="ghost" onClick={() => set("addonGroups", v.addonGroups.filter((_, j) => j !== gi))} aria-label="Remove group">
                <Trash2 size={16} />
              </Button>
            </div>
            {g.options.map((o, oi) => (
              <div key={oi} className="flex gap-2 pl-4">
                <Input placeholder="Extra cheese" value={o.name} onChange={(e) => updateOption(gi, oi, { name: e.target.value })} required />
                <Input className="w-32" type="number" min={0} step="0.01" placeholder="₹ 0" value={o.price} onChange={(e) => updateOption(gi, oi, { price: e.target.value })} />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updateGroup(gi, { options: g.options.filter((_, j) => j !== oi) })}
                  aria-label="Remove option"
                  disabled={g.options.length === 1}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="ml-4" onClick={() => updateGroup(gi, { options: [...g.options, { name: "", price: "" }] })}>
              <Plus size={14} /> Option
            </Button>
          </div>
        ))}
      </Card>

      <FormMessage state={error ? { error } : null} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save item"}
        </Button>
        <Link href={`/dashboard/menu?c=${v.categoryId}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm text-stone-600 hover:bg-stone-100">
          Cancel
        </Link>
      </div>
    </form>
  );
}
