"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatINR } from "@/lib/gst";
import { UNITS } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { createIngredient, setAutoSoldOut, stockEntry, updateIngredient } from "./actions";
import { formatQty } from "./tabs";

export function AddIngredientForm() {
  const [state, action] = useActionState(createIngredient, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <Field label="Name">
            <Input name="name" placeholder="Paneer" required />
          </Field>
        </div>
        <Field label="Unit">
          <Select name="unit" defaultValue="kg">
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Opening stock">
          <Input name="openingStock" type="number" min={0} step="0.001" defaultValue="0" />
        </Field>
        <Field label="Cost per unit (₹)">
          <Input name="costPerUnit" type="number" min={0} step="0.01" defaultValue="0" />
        </Field>
        <Field label="Alert below">
          <Input name="lowStockLevel" type="number" min={0} step="0.001" defaultValue="0" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Add</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

type Row = { id: string; name: string; unit: string; stock: number; low: number; cost: number; isActive: boolean };

export function IngredientRow({ row }: { row: Row }) {
  const [kind, setKind] = useState<"PURCHASE" | "WASTAGE" | "COUNT" | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(String(row.cost || ""));
  const [supplier, setSupplier] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const isLow = row.isActive && row.stock <= row.low;

  function submit() {
    if (!kind) return;
    start(async () => {
      const res = await stockEntry({ ingredientId: row.id, kind, quantity: qty, unitCost: kind === "PURCHASE" ? cost : undefined, supplier });
      setMsg(res);
      if (res?.ok) {
        setKind(null);
        setQty("");
      }
    });
  }

  return (
    <tr className={cn(!row.isActive && "opacity-50", isLow && "bg-red-50/50")}>
      <td className="px-4 py-3">
        <p className="font-medium">{row.name}</p>
        <button
          className="text-xs text-stone-500 hover:underline"
          onClick={() => {
            const level = prompt(`Alert when ${row.name} is below (${row.unit})`, String(row.low));
            if (level !== null) start(async () => setMsg(await updateIngredient({ id: row.id, name: row.name, lowStockLevel: level, isActive: row.isActive })));
          }}
        >
          Edit alert
        </button>
        <span className="text-xs text-stone-300"> · </span>
        <button
          className="text-xs text-stone-500 hover:underline"
          onClick={() => start(async () => setMsg(await updateIngredient({ id: row.id, name: row.name, lowStockLevel: row.low, isActive: !row.isActive })))}
        >
          {row.isActive ? "Archive" : "Restore"}
        </button>
      </td>
      <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", isLow && "text-red-700", row.stock < 0 && "text-red-700")}>
        {formatQty(row.stock, row.unit)}
        {isLow && <span className="block text-xs font-normal">Low</span>}
      </td>
      <td className="px-4 py-3 text-right text-stone-600 tabular-nums">{formatQty(row.low, row.unit)}</td>
      <td className="px-4 py-3 text-right text-stone-600 tabular-nums">
        {formatINR(Math.round(row.cost * 100))}/{row.unit}
      </td>
      <td className="px-4 py-3">
        {kind ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              className="h-8 w-24"
              type="number"
              min={0}
              step="0.001"
              placeholder={kind === "COUNT" ? "Actual" : "Qty"}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            {kind === "PURCHASE" && (
              <>
                <Input className="h-8 w-24" type="number" min={0} step="0.01" placeholder="₹/unit" value={cost} onChange={(e) => setCost(e.target.value)} />
                <Input className="h-8 w-28" placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </>
            )}
            <Button size="sm" disabled={pending} onClick={submit}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setKind(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setKind("PURCHASE")}>
              + Purchase
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setKind("WASTAGE")}>
              Wastage
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setKind("COUNT")}>
              Count
            </Button>
          </div>
        )}
        {msg?.error && <p className="mt-1 text-xs text-red-600">{msg.error}</p>}
      </td>
    </tr>
  );
}

export function AutoSoldOutToggle({ on }: { on: boolean }) {
  // Show the new state straight away; the server catches up.
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand-600"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          start(() => setAutoSoldOut(e.target.checked));
        }}
      />
      Mark dishes sold out automatically when an ingredient runs out
    </label>
  );
}
