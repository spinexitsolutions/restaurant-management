import { Check } from "lucide-react";
import Link from "next/link";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { PLANS, subscriptionStatus, subscriptionTax } from "@/lib/plans";
import { Badge, Card, PageHeader } from "@/components/ui";
import { onlineRenewalAvailable, platform } from "@/server/subscriptions";
import { PlanButton } from "./plan-button";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const s = await requireRestaurantSession(["OWNER"]);
  const [r, payments] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true, plan: true, planExpiresAt: true, state: true } }),
    db.subscriptionPayment.findMany({ where: { restaurantId: s.restaurantId }, orderBy: { createdAt: "desc" } }),
  ]);
  const status = subscriptionStatus(r.planExpiresAt);
  const p = platform();
  const online = onlineRenewalAvailable();
  const until = r.planExpiresAt?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Billing" description={`Subscription for ${r.name}. Each outlet has its own subscription.`} />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Current plan</p>
          <p className="text-xl font-semibold">
            {r.plan === "TRIAL" ? "Free trial" : "Paid"}{" "}
            <Badge tone={status.state === "ACTIVE" ? "green" : status.state === "GRACE" ? "amber" : "red"}>
              {status.state === "ACTIVE" ? `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left` : status.state === "GRACE" ? "Expired, grace period" : "Expired"}
            </Badge>
          </p>
          {until && <p className="text-sm text-stone-600">{status.state === "ACTIVE" ? "Valid until" : "Ended on"} {until}</p>}
        </div>
        {status.state !== "ACTIVE" && (
          <p className="max-w-sm text-sm text-red-700">
            {status.state === "GRACE" ? "Renew in the next few days to keep taking orders." : "New orders are blocked until you renew. Your data is safe."}
          </p>
        )}
      </Card>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const tax = subscriptionTax(plan.pricePaise, r.state, p.state);
          return (
            <Card key={plan.code} className="flex flex-col">
              <p className="font-semibold">{plan.name}</p>
              <p className="mt-2 text-3xl font-bold">{formatINR(plan.pricePaise).replace(".00", "")}</p>
              <p className="text-xs text-stone-500">
                + 18% GST = {formatINR(tax.total)} · {formatINR(Math.round(plan.pricePaise / plan.months)).replace(".00", "")}/month
              </p>
              {plan.note && <p className="mt-2 text-sm font-medium text-green-700">{plan.note}</p>}
              <ul className="my-4 space-y-1 text-sm text-stone-600">
                {["All features, unlimited orders", "Unlimited staff and tables", `Adds ${plan.months} month${plan.months > 1 ? "s" : ""} to your plan`].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check size={15} className="text-brand-600" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                {online ? (
                  <PlanButton code={plan.code} label={`Pay ${formatINR(tax.total)}`} />
                ) : (
                  <p className="text-xs text-stone-500">Online payment isn&apos;t set up yet. {p.phone || p.email ? `Contact ${p.phone ?? p.email} to renew.` : "Contact support to renew."}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Payments &amp; invoices</h2>
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-y border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {payments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                  No payments yet.
                </td>
              </tr>
            )}
            {payments.map((pay) => (
              <tr key={pay.id}>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/billing/${pay.id}`} target="_blank" className="font-medium text-brand-700 hover:underline">
                    {pay.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-600">{pay.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="px-4 py-3 text-stone-600">
                  {pay.periodStart.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} – {pay.periodEnd.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(toPaise(pay.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
