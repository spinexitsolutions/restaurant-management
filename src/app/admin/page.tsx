import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatINR, toPaise } from "@/lib/gst";
import { subscriptionStatus, type PlanDef } from "@/lib/plans";
import { applySubscription } from "@/server/subscriptions";
import { istDate } from "@/lib/numbering";
import { logout } from "../(auth)/actions";
import { ResetOwnerButton } from "./reset-owner";

export const metadata = { title: "Super admin" };

async function requireSuperAdmin() {
  const user = await getValidUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/login");
}

async function toggleRestaurant(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const r = await db.restaurant.findUnique({ where: { id }, select: { isActive: true } });
  if (r) await db.restaurant.update({ where: { id }, data: { isActive: !r.isActive } });
  revalidatePath("/admin");
}

/** Records an offline payment (cash / bank transfer) and extends the outlet's plan. */
async function extendPlan(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const months = Number(formData.get("months"));
  const amount = Math.round(Number(formData.get("amount") || 0) * 100);
  if (!Number.isInteger(months) || months < 1 || months > 36 || amount < 0) return;
  const plan = { code: months >= 12 ? "YEARLY" : months >= 3 ? "QUARTERLY" : "MONTHLY", name: "Manual", months, pricePaise: amount } as PlanDef;
  await applySubscription(id, plan, { method: "MANUAL", amountPaise: amount, months, note: String(formData.get("note") || "") || undefined });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  await requireSuperAdmin();
  const restaurants = await db.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { menuItems: true, tables: true, users: true } },
      users: { where: { role: "OWNER" }, select: { name: true, email: true, phone: true } },
      organization: { select: { name: true, _count: { select: { restaurants: true } } } },
    },
  });
  const monthStart = new Date(`${istDate().slice(0, 8)}01T00:00:00+05:30`);
  const [revenue, recent] = await Promise.all([
    db.subscriptionPayment.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    db.subscriptionPayment.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { restaurant: { select: { name: true } } } }),
  ]);
  const states = restaurants.map((r) => ({ r, sub: subscriptionStatus(r.planExpiresAt) }));
  const paidActive = states.filter((x) => x.r.plan !== "TRIAL" && x.sub.state !== "EXPIRED").length;
  const trials = states.filter((x) => x.r.plan === "TRIAL" && x.sub.state !== "EXPIRED").length;
  const expired = states.filter((x) => x.sub.state === "EXPIRED").length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="All restaurants"
        description={`${restaurants.length} restaurant(s) on the platform`}
        actions={
          <form action={logout}>
            <button className="text-sm text-stone-600 hover:text-red-600">Log out</button>
          </form>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Paying outlets", String(paidActive)],
          ["On trial", String(trials)],
          ["Expired", String(expired)],
          ["Revenue this month (ex-GST)", formatINR(toPaise(revenue._sum.amount ?? 0))],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {restaurants.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <a href={`/m/${r.slug}`} target="_blank" className="font-medium hover:underline">
                    {r.name}
                  </a>
                  <p className="text-xs text-stone-500">
                    {r.city ?? "-"}
                    {r.organization._count.restaurants > 1 && ` · ${r.organization.name} (${r.organization._count.restaurants} outlets)`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {r.users[0]?.name}
                  <p className="text-xs text-stone-500">{[r.users[0]?.email, r.users[0]?.phone].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={r.plan === "TRIAL" ? "amber" : "green"}>{r.plan}</Badge>
                  {r.planExpiresAt && <p className="mt-1 text-xs text-stone-500">till {r.planExpiresAt.toLocaleDateString("en-IN")}</p>}
                  <form action={extendPlan} className="mt-2 flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="months" className="rounded border border-stone-300 px-1 py-0.5 text-xs" aria-label="Months">
                      {[1, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>
                          +{m}m
                        </option>
                      ))}
                    </select>
                    <input name="amount" type="number" min={0} placeholder="₹ ex-GST" className="w-20 rounded border border-stone-300 px-1 py-0.5 text-xs" />
                    <button className="rounded bg-stone-900 px-2 py-0.5 text-xs text-white">Extend</button>
                  </form>
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {r._count.menuItems} items · {r._count.tables} tables · {r._count.users} staff
                </td>
                <td className="px-4 py-3 text-stone-600">{r.createdAt.toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleRestaurant}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className={`text-sm ${r.isActive ? "text-red-600" : "text-green-700"}`}>{r.isActive ? "Suspend" : "Activate"}</button>
                  </form>
                  <ResetOwnerButton restaurantId={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Recent subscription payments</h2>
        <table className="w-full min-w-[640px] text-sm">
          <tbody className="divide-y divide-stone-100">
            {recent.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-stone-500">No payments yet.</td>
              </tr>
            )}
            {recent.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2">{p.invoiceNumber}</td>
                <td className="px-5 py-2">{p.restaurant.name}</td>
                <td className="px-5 py-2 text-stone-600">
                  {p.method} · {p.months}m
                </td>
                <td className="px-5 py-2 text-stone-600">{p.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="px-5 py-2 text-right tabular-nums">{formatINR(toPaise(p.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
