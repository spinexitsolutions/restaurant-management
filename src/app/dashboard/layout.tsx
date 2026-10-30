import { LogOut, UtensilsCrossed } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/utils";
import { logout } from "../(auth)/actions";
import { DashboardNav, type NavItem } from "./nav";
import { OfflineBar } from "@/components/offline-bar";
import { ClockButton } from "@/components/clock-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantSession();
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: session.restaurantId },
    select: { name: true, plan: true, planExpiresAt: true },
  });
  const role = session.role;
  const can = (roles: string[]) => roles.includes(role);
  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: "LayoutDashboard" },
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/pos", label: "POS Billing", icon: "Receipt" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"]) ? [{ href: "/dashboard/waiter", label: "Tables", icon: "UserRound" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CHEF"]) ? [{ href: "/dashboard/kitchen", label: "Kitchen", icon: "ChefHat" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/orders", label: "Orders", icon: "ClipboardList" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"]) ? [{ href: "/dashboard/reservations", label: "Reservations", icon: "CalendarDays" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/customers", label: "Customers", icon: "Contact" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/day-close", label: "Day close", icon: "Wallet" } as const] : []),
    ...(can(["OWNER", "MANAGER"]) ? [{ href: "/dashboard/reports", label: "Reports", icon: "BarChart3" } as const] : []),
    ...(can(["OWNER", "MANAGER"])
      ? ([
          { href: "/dashboard/menu", label: "Menu", icon: "UtensilsCrossed" },
          { href: "/dashboard/inventory", label: "Inventory", icon: "Package" },
          { href: "/dashboard/tables", label: "Tables & QR", icon: "QrCode" },
          { href: "/dashboard/staff", label: "Staff", icon: "Users" },
          { href: "/dashboard/attendance", label: "Attendance", icon: "Clock" },
          { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
        ] satisfies NavItem[])
      : []),
  ];

  const trialDaysLeft =
    restaurant.plan === "TRIAL" && restaurant.planExpiresAt
      ? Math.max(0, Math.ceil((restaurant.planExpiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print border-b border-stone-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <UtensilsCrossed size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{restaurant.name}</p>
            <p className="text-xs text-stone-500">{APP_NAME}</p>
          </div>
        </div>
        <DashboardNav items={items} />
        <div className="mt-auto hidden border-t border-stone-200 p-4 lg:block">
          {trialDaysLeft !== null && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Free trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
            </p>
          )}
          <p className="truncate text-sm font-medium">{session.name}</p>
          <p className="mb-2 text-xs text-stone-500">{session.role}</p>
          <div className="mb-3">
            <ClockButton userId={session.userId} compact />
          </div>
          <form action={logout}>
            <button className="flex items-center gap-2 text-sm text-stone-600 hover:text-red-600">
              <LogOut size={16} /> Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <OfflineBar />
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
