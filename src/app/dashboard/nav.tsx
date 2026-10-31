"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock,
  Contact,
  CreditCard,
  Download,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Package,
  Printer,
  QrCode,
  Receipt,
  Settings,
  Sparkles,
  Store,
  TicketPercent,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock,
  Contact,
  CreditCard,
  Download,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Printer,
  QrCode,
  Receipt,
  Settings,
  Sparkles,
  Store,
  TicketPercent,
  Users,
  UtensilsCrossed,
  Wallet,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  section?: string;
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  let lastSection: string | undefined;
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const heading =
          item.section && item.section !== lastSection ? item.section : null;
        lastSection = item.section;
        return (
          <div key={item.href}>
            {heading && (
              <p className="mt-5 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
                {heading}
              </p>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
              )}
            >
              {active && (
                <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-brand-600" />
              )}
              <Icon
                size={17}
                strokeWidth={1.9}
                className={
                  active
                    ? "text-brand-600"
                    : "text-stone-400 group-hover:text-stone-600"
                }
              />
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/** Phone/tablet header with a slide-in menu holding the same sidebar content. */
export function MobileMenu({
  brand,
  children,
}: {
  brand: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => void (document.body.style.overflow = "");
  }, [open]);
  return (
    <div className="no-print lg:hidden">
      <div className="sticky top-0 z-30 flex h-[57px] items-center gap-3 border-b border-stone-200 bg-white/95 px-4 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-lg p-1.5 text-stone-600 hover:bg-stone-100"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0 flex-1">{brand}</div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-stone-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-elevated">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
