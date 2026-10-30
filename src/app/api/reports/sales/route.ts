import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/reports";
import { loadReportOrders, parseRange } from "@/server/reports";

const rupees = (p: number) => (p / 100).toFixed(2);

/** Invoice-wise sales register as CSV (opens in Excel), for the accountant / GST filing. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const user = session && (await db.user.findUnique({ where: { id: session.userId }, select: { role: true, isActive: true, restaurantId: true } }));
  if (!user?.isActive || !user.restaurantId || !["OWNER", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const range = parseRange(req.nextUrl.searchParams.get("from") ?? undefined, req.nextUrl.searchParams.get("to") ?? undefined);
  const orders = await loadReportOrders(user.restaurantId, range);

  const rows: (string | number | null)[][] = [
    ["Invoice No", "Date", "Table / Type", "Taxable value", "Discount", "Service charge", "CGST", "SGST", "Round off", "Total", "Payment"],
    ...orders.map((o) => [
      o.invoiceNumber,
      o.billedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      o.tableName ? `Table ${o.tableName}` : o.type,
      rupees(o.subtotal - o.discount + o.serviceCharge),
      rupees(o.discount),
      rupees(o.serviceCharge),
      rupees(o.cgst),
      rupees(o.sgst),
      rupees(o.roundOff),
      rupees(o.grandTotal),
      o.payments.map((p) => `${p.method} ${rupees(p.amount)}`).join(" + "),
    ]),
  ];
  // Excel needs the BOM to read ₹ and Hindi names correctly.
  return new NextResponse("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${range.from}-to-${range.to}.csv"`,
    },
  });
}
