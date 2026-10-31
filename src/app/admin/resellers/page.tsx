import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatINR } from "@/lib/gst";
import { appUrl } from "@/lib/utils";
import { requireSuperAdmin } from "@/server/admin";
import { resellerSummary } from "@/server/resellers";
import { NewResellerForm, PayoutForm, ResellerToggles } from "./forms";

export const metadata = { title: "Admin · Partners" };

export default async function ResellersPage() {
  await requireSuperAdmin();
  const resellers = await db.reseller.findMany({ orderBy: { createdAt: "desc" }, include: { payouts: { orderBy: { createdAt: "desc" }, take: 3 } } });
  const summaries = await Promise.all(resellers.map((r) => resellerSummary(r.id)));

  return (
    <div className="space-y-6">
      <PageHeader title="Partners" description="Agents and resellers who bring restaurants. They earn a share of every subscription payment from the restaurants they refer." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {resellers.length === 0 && <Card className="text-sm text-stone-500">No partners yet. Add your first one on the right.</Card>}
          {resellers.map((r, i) => {
            const s = summaries[i];
            const link = appUrl(`/signup?ref=${r.code}`);
            return (
              <Card key={r.id} className={r.isActive ? "" : "opacity-60"}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {r.name} <Badge tone="brand">{r.code}</Badge> {!r.isActive && <Badge tone="red">Inactive</Badge>}
                    </p>
                    <p className="text-sm text-stone-500">
                      {r.phone} · {r.email}
                    </p>
                    <p className="mt-1 truncate text-xs text-stone-500">Referral link: {link}</p>
                  </div>
                  <ResellerToggles id={r.id} isActive={r.isActive} rate={Number(r.commissionRate)} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <Stat label="Restaurants" value={String(s.restaurants.length)} />
                  <Stat label="Paying now" value={String(s.paying)} />
                  <Stat label="Earned" value={formatINR(s.earned)} />
                  <Stat label="Paid out" value={formatINR(s.paid)} />
                  <Stat label="Due" value={formatINR(s.due)} strong={s.due > 0} />
                </div>
                {s.restaurants.length > 0 && <p className="mt-3 text-xs text-stone-500">{s.restaurants.map((x) => x.name).join(", ")}</p>}
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <PayoutForm resellerId={r.id} due={s.due} />
                  {r.payouts.length > 0 && (
                    <ul className="mt-2 text-xs text-stone-500">
                      {r.payouts.map((p) => (
                        <li key={p.id}>
                          {p.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} · ₹{p.amount.toString()}
                          {p.reference && ` · ${p.reference}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <NewResellerForm />
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={strong ? "font-semibold text-brand-700" : "font-semibold"}>{value}</p>
    </div>
  );
}
