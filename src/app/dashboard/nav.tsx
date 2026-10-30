"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Sparkles, Store, CalendarDays, Clock, Contact, Package, ChefHat, ClipboardList, LayoutDashboard, Wallet, QrCode, Receipt, Settings, UserRound, Users, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { CreditCard, Sparkles, Store, CalendarDays, Clock, Contact, Package, BarChart3, Wallet, ClipboardList, LayoutDashboard, UtensilsCrossed, QrCode, Users, Settings, Receipt, ChefHat, UserRound };

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  soon?: boolean;
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/dashboard" ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        if (item.soon) {
          return (
            <span key={item.href} className="flex shrink-0 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-400">
              <Icon size={18} />
              {item.label}
              <span className="ml-auto rounded bg-stone-100 px-1.5 text-[10px] font-semibold uppercase">Soon</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
