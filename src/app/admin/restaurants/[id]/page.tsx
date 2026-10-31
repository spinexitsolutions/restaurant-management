import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatINR, toPaise } from "@/lib/gst";
import { subscriptionStatus } from "@/lib/plans";
import { APP_NAME, appUrl } from "@/lib/utils";
import { ownerOf, renewalWhatsApp, requireSuperAdmin } from "@/server/admin";
import { PlanBadge } from "../../plan-badge";
import { AdminNote, ExtendPlanForm, PartnerSelect, RestaurantActions } from "./controls";

export const metadata = { title: "Admin · Restaurant" };

const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default async function AdminRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const r = await db.restaurant.findUnique({
    where: { id },
    include: {
      users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true } },
      organization: { include: { restaurants: { select: { id: true, name: true } }, reseller: { select: { id: true, name: true } } } },
      subscriptionPayments: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { menuItems: true, tables: true, customers: true } },
    },
  });
  if (!r) notFound();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [orders30, sales30, lastOrder, resellers, support, orgOwner] = await Promise.all([
    db.order.count({ where: { restaurantId: id, createdAt: { gte: since30 } } }),
    db.order.aggregate({ where: { restaurantId: id, status: "PAID", billedAt: { gte: since30 } }, _sum: { grandTotal: true } }),
    db.order.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.reseller.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.auditLog.findMany({ where: { restaurantId: id, action: { in: ["SUPPORT_LOGIN", "SUPPORT_LOGOUT"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    ownerOf(id),
  ]);
  const owner = r.users.find((u) => u.role === "OWNER") ?? orgOwner;
  const sub = subscriptionStatus(r.planExpiresAt);
  const wa = renewalWhatsApp({ name: r.name, owner, daysLeft: sub.daysLeft, plan: r.plan }, APP_NAME, appUrl("/dashboard/billing"));

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={14} /> All restaurants
      </Link>
      <PageHeader
        title={r.name}
        description={[r.city, r.state, r.organization.restaurants.length > 1 ? `${r.organization.name}: ${r.organization.restaurants.length} outlets` : null].filter(Boolean).join(" · ")}
        actions={
          <a href={`/m/${r.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-300">
            <ExternalLink size={16} /> QR menu
          </a>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Orders (30 days)", String(orders30)],
          ["Sales (30 days)", formatINR(toPaise(sales30._sum.grandTotal ?? 0))],
          ["Last order", lastOrder ? fmt(lastOrder.createdAt) : "never"],
          ["Setup", `${r._count.menuItems} items · ${r._count.tables} tables · ${r._count.customers} customers`],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Subscription</h2>
            <PlanBadge r={{ plan: r.plan, state: sub.state, daysLeft: sub.daysLeft, isActive: r.isActive }} />
          </div>
          <p className="text-sm text-stone-600">
            {r.plan === "TRIAL" ? "Free trial" : "Paid plan"}
            {r.planExpiresAt && ` till ${fmt(r.planExpiresAt)}`} · joined {fmt(r.createdAt)}
            {r.deletionScheduledAt && <span className="block text-red-600">Owner asked to delete the account: deleting on {fmt(r.deletionScheduledAt)}</span>}
          </p>
          <ExtendPlanForm id={r.id} />
          {wa && (
            <a href={wa} target="_blank" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white">
              <MessageCircle size={16} /> Send renewal reminder
            </a>
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Support</h2>
          <RestaurantActions id={r.id} isActive={r.isActive} hasOwner={!!owner?.isActive} />
          {support.length > 0 && (
            <ul className="text-xs text-stone-500">
              {support.map((a) => (
                <li key={a.id}>
                  {fmt(a.createdAt)} · {a.userName} · {a.action === "SUPPORT_LOGIN" ? "logged in" : "left"}
                </li>
              ))}
            </ul>
          )}
          <AdminNote id={r.id} note={r.adminNote ?? ""} />
          <PartnerSelect restaurantId={r.id} current={r.organization.reseller?.id ?? ""} options={resellers} />
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Staff logins</h2>
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-stone-100">
            {r.users.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                <td className="px-5 py-2 font-medium">{u.name}</td>
                <td className="px-5 py-2 text-stone-600">{u.role}</td>
                <td className="px-5 py-2 text-stone-600">{[u.phone, u.email].filter(Boolean).join(" · ")}</td>
                <td className="px-5 py-2 text-right text-stone-500">{u.lastLoginAt ? `last login ${fmt(u.lastLoginAt)}` : "never logged in"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Subscription payments</h2>
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-stone-100">
            {r.subscriptionPayments.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-stone-500">No payments yet.</td>
              </tr>
            )}
            {r.subscriptionPayments.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2">{p.invoiceNumber}</td>
                <td className="px-5 py-2 text-stone-600">
                  {p.method} · {p.months}m{p.note ? ` · ${p.note}` : ""}
                </td>
                <td className="px-5 py-2 text-stone-600">{fmt(p.createdAt)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{formatINR(toPaise(p.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
