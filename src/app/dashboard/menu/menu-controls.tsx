"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Input, FormMessage } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createCategory, deleteCategory, deleteItem, moveCategory, renameCategory, toggleCategory, toggleItemAvailability } from "./actions";

export function AddCategoryForm() {
  const [state, action] = useActionState(createCategory, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <Input name="name" placeholder="New category" required />
        <SubmitButton size="md" pendingText="...">
          Add
        </SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

const iconBtn = "rounded p-1.5 text-stone-500 hover:bg-stone-200 hover:text-stone-900 disabled:opacity-30";

export function CategoryControls(props: { id: string; name: string; isActive: boolean; isFirst: boolean; isLast: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 items-center pr-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
      <button className={iconBtn} disabled={pending || props.isFirst} onClick={() => start(() => moveCategory(props.id, "up"))} title="Move up">
        <ArrowUp size={14} />
      </button>
      <button className={iconBtn} disabled={pending || props.isLast} onClick={() => start(() => moveCategory(props.id, "down"))} title="Move down">
        <ArrowDown size={14} />
      </button>
      <button
        className={iconBtn}
        disabled={pending}
        title="Rename"
        onClick={() => {
          const name = prompt("Category name", props.name);
          if (name && name.trim() && name !== props.name) start(() => renameCategory(props.id, name));
        }}
      >
        <Pencil size={14} />
      </button>
      <button className={iconBtn} disabled={pending} onClick={() => start(() => toggleCategory(props.id))} title={props.isActive ? "Hide from menu" : "Show on menu"}>
        {props.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button
        className={iconBtn}
        disabled={pending}
        title="Delete"
        onClick={() => {
          if (!confirm(`Delete category "${props.name}"?`)) return;
          start(async () => {
            const res = await deleteCategory(props.id);
            if (res?.error) alert(res.error);
          });
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function ItemControls({ id, isAvailable }: { id: string; isAvailable: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        disabled={pending}
        onClick={() => start(() => toggleItemAvailability(id))}
        className={`h-8 rounded-full px-3 text-xs font-medium ${isAvailable ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600"}`}
        title="Toggle availability"
      >
        {isAvailable ? "In stock" : "Sold out"}
      </button>
      <Link href={`/dashboard/menu/items/${id}`} className={iconBtn} title="Edit">
        <Pencil size={16} />
      </Link>
      <button
        className={iconBtn}
        disabled={pending}
        title="Delete"
        onClick={() => confirm("Delete this item?") && start(() => deleteItem(id))}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
