import Link from "next/link";
import { AlertTriangle, LogOut, ShieldCheck } from "lucide-react";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { APP_NAME } from "@/lib/utils";
import { subscriptionStatus } from "@/lib/plans";
import { isLang, translator, type Lang } from "@/lib/i18n";
import { logout } from "../(auth)/actions";
import { exitSupport } from "@/app/admin/actions";
import { ClockButton } from "@/components/clock-button";
import { I18nProvider, LanguagePicker } from "@/components/i18n";
import { LogoMark } from "@/components/logo";
import { OfflineBar } from "@/components/offline-bar";
import { PushToggle } from "@/components/push-toggle";
import { outletsFor } from "@/server/outlets";
import { pushPublicKey } from "@/server/push";
import { DashboardNav, MobileMenu, type NavItem } from "./nav";
import { OutletSwitcher } from "./outlets/forms";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  WAITER: "Waiter",
  CHEF: "Chef",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRestaurantSession();
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: session.restaurantId },
    select: {
      name: true,
      plan: true,
      planExpiresAt: true,
      deletionScheduledAt: true,
    },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { language: true },
  });
  const lang: Lang = isLang(user.language) ? user.language : "en";
  const t = translator(lang);
  const role = session.role;
  const can = (roles: string[]) => roles.includes(role);

  const ops = t("nav.section.operations");
  const guests = t("nav.section.customers");
  const business = t("nav.section.business");
  const setup = t("nav.section.setup");
  const account = t("nav.section.account");
  const items: NavItem[] = [
    { href: "/dashboard", label: t("nav.overview"), icon: "LayoutDashboard" },
    ...(can(["OWNER", "MANAGER", "CASHIER"])
      ? [
          {
            href: "/dashboard/pos",
            label: t("nav.pos"),
            icon: "Receipt",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"])
      ? [
          {
            href: "/dashboard/waiter",
            label: t("nav.tables"),
            icon: "LayoutGrid",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CHEF"])
      ? [
          {
            href: "/dashboard/kitchen",
            label: t("nav.kitchen"),
            icon: "ChefHat",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["CASHIER", "CHEF"])
      ? [
          {
            href: "/dashboard/print-station",
            label: t("nav.printStation"),
            icon: "Printer",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"])
      ? [
          {
            href: "/dashboard/orders",
            label: t("nav.orders"),
            icon: "ClipboardList",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CASHIER", "WAITER"])
      ? [
          {
            href: "/dashboard/reservations",
            label: t("nav.reservations"),
            icon: "CalendarDays",
            section: ops,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"])
      ? [
          {
            href: "/dashboard/customers",
            label: t("nav.customers"),
            icon: "Contact",
            section: guests,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER"])
      ? [
          {
            href: "/dashboard/coupons",
            label: t("nav.coupons"),
            icon: "TicketPercent",
            section: guests,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER", "CASHIER"])
      ? [
          {
            href: "/dashboard/day-close",
            label: t("nav.dayClose"),
            icon: "Wallet",
            section: business,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER"])
      ? [
          {
            href: "/dashboard/reports",
            label: t("nav.reports"),
            icon: "BarChart3",
            section: business,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER"])
      ? [
          {
            href: "/dashboard/insights",
            label: t("nav.insights"),
            icon: "Sparkles",
            section: business,
          } as const,
        ]
      : []),
    ...(can(["OWNER", "MANAGER"])
      ? ([
          {
            href: "/dashboard/menu",
            label: t("nav.menu"),
            icon: "UtensilsCrossed",
            section: setup,
          },
          {
            href: "/dashboard/kitchen-setup",
            label: t("nav.kitchenSetup"),
            icon: "Printer",
            section: setup,
          },
          {
            href: "/dashboard/inventory",
            label: t("nav.inventory"),
            icon: "Package",
            section: setup,
          },
          {
            href: "/dashboard/tables",
            label: t("nav.tablesQr"),
            icon: "QrCode",
            section: setup,
          },
          {
            href: "/dashboard/staff",
            label: t("nav.staff"),
            icon: "Users",
            section: setup,
          },
          {
            href: "/dashboard/attendance",
            label: t("nav.attendance"),
            icon: "Clock",
            section: setup,
          },
          {
            href: "/dashboard/settings",
            label: t("nav.settings"),
            icon: "Settings",
            section: account,
          },
          {
            href: "/dashboard/data",
            label: t("nav.data"),
            icon: "Download",
            section: account,
          },
          ...(role === "OWNER"
            ? ([
                {
                  href: "/dashboard/outlets",
                  label: t("nav.outlets"),
                  icon: "Store",
                  section: account,
                },
                {
                  href: "/dashboard/billing",
                  label: t("nav.billing"),
                  icon: "CreditCard",
                  section: account,
                },
              ] satisfies NavItem[])
            : []),
        ] satisfies NavItem[])
      : []),
  ];

  const sub = subscriptionStatus(restaurant.planExpiresAt);
  const outlets = role === "OWNER" ? await outletsFor(session.userId) : [];
  // Warn a week before a paid plan ends, and throughout the trial's last 3 days.
  const warn =
    sub.state !== "ACTIVE" ||
    sub.daysLeft <= (restaurant.plan === "TRIAL" ? 3 : 7);
  const subText =
    sub.state === "EXPIRED"
      ? "Your subscription has expired. New orders are blocked."
      : sub.state === "GRACE"
        ? "Your subscription has expired. Renew now to keep taking orders."
        : `${restaurant.plan === "TRIAL" ? "Your free trial" : "Your subscription"} ends in ${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"}.`;
  const displayName = session.name.replace(/ \(support: .*\)$/, "");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      <LogoMark size={30} />
      <div className="min-w-0">
        <p className="truncate text-sm leading-tight font-semibold text-stone-900">
          {restaurant.name}
        </p>
        {outlets.length > 1 ? (
          <OutletSwitcher
            outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
            current={session.restaurantId}
          />
        ) : (
          <p className="text-xs text-stone-500">{APP_NAME}</p>
        )}
      </div>
    </div>
  );

  const accountPanel = (
    <div className="space-y-3 border-t border-stone-200 p-4">
      {restaurant.plan === "TRIAL" && !warn && (
        <Link
          href={role === "OWNER" ? "/dashboard/billing" : "/dashboard"}
          className="block rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800"
        >
          <span className="font-semibold">Free trial</span> · {sub.daysLeft} day
          {sub.daysLeft === 1 ? "" : "s"} left
        </Link>
      )}
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
          {initials || "U"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">
            {displayName}
          </p>
          <p className="text-xs text-stone-500">{ROLE_LABEL[role] ?? role}</p>
        </div>
        <form action={logout}>
          <button
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600"
            title={t("nav.logout")}
            aria-label={t("nav.logout")}
          >
            <LogOut size={17} />
          </button>
        </form>
      </div>
      <ClockButton userId={session.userId} compact t={t} />
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <LanguagePicker />
        </div>
        <PushToggle publicKey={pushPublicKey()} compact />
      </div>
    </div>
  );

  return (
    <I18nProvider lang={lang}>
      <div className="min-h-screen lg:flex">
        <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
          <div className="flex h-16 items-center border-b border-stone-200 px-5">
            {brand}
          </div>
          <DashboardNav items={items} />
          {accountPanel}
        </aside>
        <MobileMenu brand={brand}>
          <div className="flex h-16 items-center border-b border-stone-200 px-5 pr-12">
            {brand}
          </div>
          <DashboardNav items={items} />
          {accountPanel}
        </MobileMenu>

        <div className="min-w-0 flex-1">
          <OfflineBar />
          {session.support && (
            <form
              action={exitSupport}
              className="no-print flex flex-wrap items-center gap-3 bg-violet-700 px-4 py-2 text-sm text-white"
            >
              <ShieldCheck size={16} />
              <span className="flex-1">
                Support session: you are inside <b>{restaurant.name}</b> as{" "}
                {role.toLowerCase()} ({session.support}). All actions are
                recorded.
              </span>
              <button className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-violet-800">
                Exit support
              </button>
            </form>
          )}
          {restaurant.deletionScheduledAt && (
            <div className="no-print flex flex-wrap items-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
              <AlertTriangle size={16} />
              <span className="flex-1">
                This account will be permanently deleted on{" "}
                {restaurant.deletionScheduledAt.toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                })}
                .
              </span>
              {role === "OWNER" && (
                <Link
                  href="/dashboard/data"
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700"
                >
                  Cancel deletion
                </Link>
              )}
            </div>
          )}
          {warn && (
            <div
              className={`no-print flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm ${sub.state === "ACTIVE" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-700 bg-red-600 text-white"}`}
            >
              <AlertTriangle size={16} />
              <span className="flex-1">{subText}</span>
              {role === "OWNER" ? (
                <Link
                  href="/dashboard/billing"
                  className="rounded-md bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white"
                >
                  Renew plan
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
