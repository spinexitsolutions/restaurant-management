import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { subscriptionStatus } from "@/lib/plans";
import { APP_NAME, appUrl } from "@/lib/utils";
import { resellerSummary } from "@/server/resellers";
import { logout } from "../(auth)/actions";
import { CopyLink } from "./copy-link";

export const metadata = { title: "Partner" };

/** Partner portal: referral link, referred restaurants and commission. Read-only. */
export default async function PartnerPage() {
  const user = await getValidUser();
  if (!user || user.role !== "RESELLER") redirect("/login");
  const reseller = await db.reseller.findUnique({ where: { userId: user.id } });
  if (!reseller || !reseller.isActive) redirect("/login");
  const [s, commissions, payouts] = await Promise.all([
    resellerSummary(reseller.id),
    db.resellerCommission.findMany({ where: { resellerId: reseller.id }, orderBy: { createdAt: "desc" }, take: 30, include: { subscriptionPayment: { select: { months: true, amount: true, restaurant: { select: { name: true } } } } } }),
    db.resellerPayout.findMany({ where: { resellerId: reseller.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const link = appUrl(`/signup?ref=${reseller.code}`);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title={`Namaste, ${reseller.name}`}
        description={`${APP_NAME} partner · you earn ${reseller.commissionRate.toString()}% of every subscription payment from restaurants you bring`}
        actions={
          <form action={logout}>
            <button className="text-sm text-stone-600 hover:text-red-600">Log out</button>
          </form>
        }
      />
      <Card>
        <p className="font-semibold">Your sign-up link</p>
        <p className="mb-3 text-sm text-stone-600">Restaurants that sign up with this link (or code {reseller.code}) are counted as yours.</p>
        <CopyLink link={link} />
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Restaurants", String(s.restaurants.length)],
          ["Paying now", String(s.paying)],
          ["Earned", formatINR(s.earned)],
          ["Paid to you", formatINR(s.paid)],
          ["Due to you", formatINR(s.due)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Your restaurants</h2>
        <table className="w-full min-w-[560px] text-sm">
          <tbody className="divide-y divide-stone-100">
            {s.restaurants.length === 0 && (
              <tr>
                <td className="px-5 py-6 text-center text-stone-500">No restaurants yet. Share your link!</td>
              </tr>
            )}
            {s.restaurants.map((r) => {
              const sub = subscriptionStatus(r.planExpiresAt);
              return (
                <tr key={r.id}>
                  <td className="px-5 py-2 font-medium">{r.name}</td>
                  <td className="px-5 py-2 text-stone-600">{r.city ?? "-"}</td>
                  <td className="px-5 py-2">
                    {sub.state === "EXPIRED" ? <Badge tone="red">Expired</Badge> : r.plan === "TRIAL" ? <Badge tone="brand">Trial</Badge> : <Badge tone="green">Paying</Badge>}
                  </td>
                  <td className="px-5 py-2 text-stone-600">{r.planExpiresAt ? `till ${fmt(r.planExpiresAt)}` : ""}</td>
                  <td className="px-5 py-2 text-right text-stone-500">joined {fmt(r.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Commission</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {commissions.length === 0 && <li className="px-5 pb-5 text-stone-500">Nothing yet.</li>}
            {commissions.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 px-5 py-2">
                <span>
                  {c.subscriptionPayment.restaurant.name} <span className="text-stone-500">· {c.subscriptionPayment.months}m · {fmt(c.createdAt)}</span>
                </span>
                <span className="font-medium">{formatINR(toPaise(c.amount))}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Payments to you</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {payouts.length === 0 && <li className="px-5 pb-5 text-stone-500">Nothing yet.</li>}
            {payouts.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 px-5 py-2">
                <span>
                  {fmt(p.createdAt)} {p.reference && <span className="text-stone-500">· {p.reference}</span>}
                </span>
                <span className="font-medium">{formatINR(toPaise(p.amount))}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
