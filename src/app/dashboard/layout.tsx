import { LogOut, UtensilsCrossed } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/utils";
import { logout } from "../(auth)/actions";
import { DashboardNav, type NavItem } from "./nav";
import { OfflineBar } from "@/components/offline-bar";
import { ClockButton } from "@/components/clock-button";
import Link from "next/link";
import { subscriptionStatus } from "@/lib/plans";
import { outletsFor } from "@/server/outlets";
import { OutletSwitcher } from "./outlets/forms";
import { I18nProvider, LanguagePicker } from "@/components/i18n";
import { PushToggle } from "@/components/push-toggle";
import { isLang, translator, type Lang } from "@/lib/i18n";
import { pushPublicKey } from "@/server/push";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantSession();
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: session.restaurantId },
    select: { name: true, plan: true, planExpiresAt: true, deletionScheduledAt: true },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: session.userId }, select: { language: true } });
  const lang: Lang = isLang(user.language) ? user.language : "en";
  const t = translator(lang);
  const role = session.role;
  const can = (roles: string[]) => roles.includes(role);
  const items: NavItem[] = [
    { href: "/dashboard", label: t("nav.overview"), icon: "LayoutDashboard" },
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/pos", label: t("nav.pos"), icon: "Receipt" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"]) ? [{ href: "/dashboard/waiter", label: t("nav.tables"), icon: "UserRound" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CHEF"]) ? [{ href: "/dashboard/kitchen", label: t("nav.kitchen"), icon: "ChefHat" } as const] : []),
    ...(can(["CASHIER", "CHEF"]) ? [{ href: "/dashboard/print-station", label: t("nav.printStation"), icon: "Printer" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/orders", label: t("nav.orders"), icon: "ClipboardList" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"]) ? [{ href: "/dashboard/reservations", label: t("nav.reservations"), icon: "CalendarDays" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/customers", label: t("nav.customers"), icon: "Contact" } as const] : []),
    ...(can(["OWNER", "MANAGER"]) ? [{ href: "/dashboard/coupons", label: t("nav.coupons"), icon: "TicketPercent" } as const] : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"]) ? [{ href: "/dashboard/day-close", label: t("nav.dayClose"), icon: "Wallet" } as const] : []),
    ...(can(["OWNER", "MANAGER"]) ? [{ href: "/dashboard/reports", label: t("nav.reports"), icon: "BarChart3" } as const] : []),
    ...(can(["OWNER", "MANAGER"]) ? [{ href: "/dashboard/insights", label: t("nav.insights"), icon: "Sparkles" } as const] : []),
    ...(can(["OWNER", "MANAGER"])
      ? ([
          { href: "/dashboard/menu", label: t("nav.menu"), icon: "UtensilsCrossed" },
          { href: "/dashboard/kitchen-setup", label: t("nav.kitchenSetup"), icon: "Printer" },
          { href: "/dashboard/inventory", label: t("nav.inventory"), icon: "Package" },
          { href: "/dashboard/tables", label: t("nav.tablesQr"), icon: "QrCode" },
          { href: "/dashboard/staff", label: t("nav.staff"), icon: "Users" },
          { href: "/dashboard/attendance", label: t("nav.attendance"), icon: "Clock" },
          { href: "/dashboard/settings", label: t("nav.settings"), icon: "Settings" },
          { href: "/dashboard/data", label: t("nav.data"), icon: "Download" },
          ...(role === "OWNER"
            ? ([
                { href: "/dashboard/outlets", label: t("nav.outlets"), icon: "Store" },
                { href: "/dashboard/billing", label: t("nav.billing"), icon: "CreditCard" },
              ] satisfies NavItem[])
            : []),
        ] satisfies NavItem[])
      : []),
  ];

  const sub = subscriptionStatus(restaurant.planExpiresAt);
  const outlets = role === "OWNER" ? await outletsFor(session.userId) : [];
  // Warn a week before a paid plan ends, and throughout the trial's last 3 days.
  const warn = sub.state !== "ACTIVE" || sub.daysLeft <= (restaurant.plan === "TRIAL" ? 3 : 7);
  const subText =
    sub.state === "EXPIRED"
      ? "Subscription expired. New orders are blocked."
      : sub.state === "GRACE"
        ? "Subscription expired. Renew now to keep taking orders."
        : `${restaurant.plan === "TRIAL" ? "Free trial" : "Subscription"} ends in ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}.`;

  return (
    <I18nProvider lang={lang}>
    <div className="min-h-screen lg:flex">
      <aside className="no-print border-b border-stone-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <UtensilsCrossed size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{restaurant.name}</p>
            {outlets.length > 1 ? (
              <OutletSwitcher outlets={outlets.map((o) => ({ id: o.id, name: o.name }))} current={session.restaurantId} />
            ) : (
              <p className="text-xs text-stone-500">{APP_NAME}</p>
            )}
          </div>
        </div>
        <DashboardNav items={items} />
        <div className="mt-auto hidden border-t border-stone-200 p-4 lg:block">
          {restaurant.plan === "TRIAL" && !warn && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Free trial: {sub.daysLeft} day{sub.daysLeft === 1 ? "" : "s"} left
            </p>
          )}
          <p className="truncate text-sm font-medium">{session.name}</p>
          <p className="mb-2 text-xs text-stone-500">{session.role}</p>
          <div className="mb-3">
            <ClockButton userId={session.userId} compact t={t} />
          </div>
          <div className="mb-3 space-y-2">
            <LanguagePicker />
            <PushToggle publicKey={pushPublicKey()} />
          </div>
          <form action={logout}>
            <button className="flex items-center gap-2 text-sm text-stone-600 hover:text-red-600">
              <LogOut size={16} /> {t("nav.logout")}
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <OfflineBar />
        {restaurant.deletionScheduledAt && (
          <div className="no-print flex flex-wrap items-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
            <span>
              This account will be permanently deleted on {restaurant.deletionScheduledAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}.
            </span>
            {role === "OWNER" && (
              <Link href="/dashboard/data" className="rounded bg-white/90 px-2 py-0.5 font-semibold text-stone-900">
                Cancel deletion
              </Link>
            )}
          </div>
        )}
        {warn && (
          <div className={`no-print flex flex-wrap items-center gap-3 px-4 py-2 text-sm ${sub.state === "ACTIVE" ? "bg-amber-100 text-amber-900" : "bg-red-600 text-white"}`}>
            <span>{subText}</span>
            {role === "OWNER" ? (
              <Link href="/dashboard/billing" className="rounded bg-white/80 px-2 py-0.5 font-semibold text-stone-900">
                Renew
              </Link>
            ) : (
              <span className="opacity-80">Ask the owner to renew.</span>
            )}
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
    </I18nProvider>
  );
}
