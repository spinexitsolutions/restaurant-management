"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, FormMessage, Input, Select } from "@/components/ui";
import { formatINR } from "@/lib/gst";
import { foodCostPercent, recipeCostPaise } from "@/lib/inventory";
import { saveRecipe } from "../../actions";

type Line = { ingredientId: string; variantId: string | null; quantity: string };

export function RecipeEditor(props: {
  menuItemId: string;
  price: number;
  variants: { id: string; name: string; price: number }[];
  ingredients: { id: string; name: string; unit: string; cost: number }[];
  initial: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(props.initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(props.ingredients.map((i) => [i.id, i]));

  // Default recipe plus, for items with sizes, an optional recipe per size.
  const sections: { variantId: string | null; label: string; price: number }[] = [
    { variantId: null, label: props.variants.length ? "Default (used for sizes without their own recipe)" : "Per portion", price: props.variants[0]?.price ?? props.price },
    ...props.variants.map((v) => ({ variantId: v.id, label: v.name, price: v.price })),
  ];

  if (props.ingredients.length === 0) {
    return (
      <Card className="text-sm text-stone-600">
        Add ingredients first in{" "}
        <Link href="/dashboard/inventory" className="text-brand-700 underline">
          Inventory → Stock
        </Link>
        .
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((sec) => {
        const own = lines.map((l, i) => ({ ...l, i })).filter((l) => l.variantId === sec.variantId);
        const effective = own.length || sec.variantId === null ? own : lines.map((l, i) => ({ ...l, i })).filter((l) => l.variantId === null);
        const cost = recipeCostPaise(effective.map((l) => ({ quantity: Number(l.quantity) || 0, costPerUnit: byId.get(l.ingredientId)?.cost ?? 0 })));
        const pct = effective.length ? foodCostPercent(cost, sec.price) : null;
        return (
          <Card key={sec.variantId ?? "default"} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{sec.label}</h2>
                <p className="text-xs text-stone-500">
                  Cost {formatINR(cost)} · price {formatINR(sec.price)}
                  {sec.variantId && !own.length && " · using default recipe"}
                </p>
              </div>
              {pct !== null && <Badge tone={pct > 40 ? "red" : pct > 30 ? "amber" : "green"}>Food cost {pct}%</Badge>}
            </div>
            {own.map((l) => {
              const ing = byId.get(l.ingredientId);
              return (
                <div key={l.i} className="flex items-center gap-2">
                  <Select value={l.ingredientId} onChange={(e) => setLines(lines.map((x, j) => (j === l.i ? { ...x, ingredientId: e.target.value } : x)))}>
                    {props.ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    step="0.001"
                    value={l.quantity}
                    onChange={(e) => setLines(lines.map((x, j) => (j === l.i ? { ...x, quantity: e.target.value } : x)))}
                    aria-label="Quantity"
                  />
                  <span className="w-10 text-sm text-stone-500">{ing?.unit}</span>
                  <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== l.i))} aria-label="Remove">
                    <Trash2 size={16} />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines([...lines, { ingredientId: props.ingredients[0].id, variantId: sec.variantId, quantity: "" }])}
            >
              <Plus size={14} /> Ingredient
            </Button>
          </Card>
        );
      })}
      <div className="flex items-center gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () =>
              setMsg(
                await saveRecipe({
                  menuItemId: props.menuItemId,
                  lines: lines.map((l) => ({ ingredientId: l.ingredientId, variantId: l.variantId, quantity: Number(l.quantity) })),
                }),
              ),
            )
          }
        >
          {pending ? "Saving..." : "Save recipe"}
        </Button>
        <Link href="/dashboard/inventory/recipes" className="text-sm text-stone-600 hover:underline">
          Back
        </Link>
        <FormMessage state={msg} />
      </div>
    </div>
  );
}
