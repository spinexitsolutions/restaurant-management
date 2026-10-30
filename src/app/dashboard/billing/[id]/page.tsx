import { notFound } from "next/navigation";
import { requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { findPlan } from "@/lib/plans";
import { platform } from "@/server/subscriptions";
import { PrintButton } from "../../tables/print/print-button";

export const metadata = { title: "Subscription invoice" };

const SAC_SAAS = "998314"; // IT design and development services / SaaS

export default async function SubscriptionInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRestaurantSession(["OWNER"]);
  const { id } = await params;
  const pay = await db.subscriptionPayment.findFirst({ where: { id, restaurantId: s.restaurantId }, include: { restaurant: true } });
  if (!pay) notFound();
  const p = platform();
  const r = pay.restaurant;
  const d = (x: Date) => x.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
  const money = (v: { toString(): string }) => formatINR(toPaise(v));

  return (
    <div>
      <div className="no-print mb-4 flex justify-center">
        <PrintButton />
      </div>
      <div className="mx-auto max-w-2xl bg-white p-8 text-sm shadow-sm print:shadow-none">
        <div className="flex justify-between gap-6 border-b border-stone-200 pb-4">
          <div>
            <p className="text-lg font-bold">{p.legalName}</p>
            {p.address && <p className="whitespace-pre-line text-stone-600">{p.address}</p>}
            {p.gstin && <p>GSTIN: {p.gstin}</p>}
            {p.email && <p>{p.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{p.gstin ? "TAX INVOICE" : "INVOICE"}</p>
            <p>No: {pay.invoiceNumber}</p>
            <p>Date: {d(pay.createdAt)}</p>
          </div>
        </div>
        <div className="border-b border-stone-200 py-4">
          <p className="text-xs text-stone-500 uppercase">Billed to</p>
          <p className="font-semibold">{r.name}</p>
          <p className="text-stone-600">{[r.address, r.city, r.state, r.pincode].filter(Boolean).join(", ")}</p>
          {r.gstin && <p>GSTIN: {r.gstin}</p>}
          <p>Place of supply: {r.state || p.state || "-"}</p>
        </div>
        <table className="my-4 w-full">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2">
                {p.name} restaurant software · {findPlan(pay.planCode)?.name ?? pay.planCode} ({pay.months} month{pay.months > 1 ? "s" : ""})
                <span className="block text-xs text-stone-500">
                  {d(pay.periodStart)} – {d(pay.periodEnd)}
                </span>
              </td>
              <td className="py-2">{SAC_SAAS}</td>
              <td className="py-2 text-right tabular-nums">{money(pay.amount)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="ml-auto w-64 space-y-1">
          {toPaise(pay.cgst) > 0 && (
            <>
              <Row label="CGST @ 9%" value={money(pay.cgst)} />
              <Row label="SGST @ 9%" value={money(pay.sgst)} />
            </>
          )}
          {toPaise(pay.igst) > 0 && <Row label="IGST @ 18%" value={money(pay.igst)} />}
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd>{money(pay.total)}</dd>
          </div>
        </dl>
        <p className="mt-6 text-xs text-stone-500">
          Paid via {pay.method === "RAZORPAY" ? `Razorpay (${pay.razorpayPaymentId})` : "manual payment"}
          {pay.note && ` · ${pay.note}`}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
