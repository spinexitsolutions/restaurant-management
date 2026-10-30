import Link from "next/link";
import { cn } from "@/lib/utils";

export function InventoryTabs({ active }: { active: "stock" | "recipes" | "history" }) {
  const tabs = [
    ["stock", "Stock", "/dashboard/inventory"],
    ["recipes", "Recipes & food cost", "/dashboard/inventory/recipes"],
    ["history", "History", "/dashboard/inventory/history"],
  ] as const;
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map(([key, label, href]) => (
        <Link key={key} href={href} className={cn("shrink-0 px-4 py-2 text-sm font-medium", active === key ? "border-b-2 border-brand-600 text-brand-700" : "text-stone-500")}>
          {label}
        </Link>
      ))}
    </div>
  );
}

export function formatQty(n: number, unit: string) {
  return `${Number(n.toFixed(3)).toLocaleString("en-IN")} ${unit}`;
}
