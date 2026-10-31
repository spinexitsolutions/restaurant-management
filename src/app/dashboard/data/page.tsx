import Link from "next/link";
import { Download } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { Card, PageHeader } from "@/components/ui";
import { EXPORT_KINDS, type ExportKind } from "@/server/data-export";
import { DELETION_GRACE_DAYS } from "@/server/privacy";
import { DeleteAccountForm, ExportForm, UndoDeletionButton } from "./forms";

export const metadata = { title: "Data & privacy" };

export default async function DataPage() {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true, deletionScheduledAt: true, organization: { select: { _count: { select: { restaurants: true } } } } } });
  const today = istDate();
  const monthStart = today.slice(0, 8) + "01";
  const kinds = (Object.keys(EXPORT_KINDS) as ExportKind[]).filter((k) => k !== "menu-template" && (k !== "customers" || s.role === "OWNER"));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Data & privacy" description="Your data belongs to you. Download it any time as Excel-ready CSV files." />

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Download size={18} /> Download data
        </h2>
        <p className="mb-4 text-sm text-stone-600">Dates apply to orders, items, payments, stock and attendance. Customers and menu are always complete.</p>
        <ExportForm kinds={kinds.map((k) => ({ kind: k, label: EXPORT_KINDS[k].label, dated: EXPORT_KINDS[k].dated }))} from={monthStart} to={today} />
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Customer data requests</h2>
        <p className="text-sm text-stone-600">
          If a guest asks you to delete their data, open them in <Link href="/dashboard/customers" className="underline">Customers</Link> and use “Delete this customer’s data”.
          Their name and mobile are removed from every bill; amounts stay for your GST records.
        </p>
      </Card>

      {s.role === "OWNER" && (
        <Card className="border-red-200">
          <h2 className="mb-1 font-semibold text-red-700">Delete account</h2>
          {r.deletionScheduledAt ? (
            <div className="space-y-3 text-sm">
              <p>
                Everything will be permanently deleted on <b>{r.deletionScheduledAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" })}</b>. Download anything you need before then.
              </p>
              <UndoDeletionButton />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-stone-600">
                Deletes {r.organization._count.restaurants > 1 ? `all ${r.organization._count.restaurants} outlets` : "the restaurant"}, menu, orders, bills, customers and staff logins
                after {DELETION_GRACE_DAYS} days. You can cancel until then. Download your bills first: you must keep GST records for 6 years.
              </p>
              <DeleteAccountForm name={r.name} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
