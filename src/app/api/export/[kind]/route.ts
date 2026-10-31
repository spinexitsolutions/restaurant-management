import { NextResponse, type NextRequest } from "next/server";
import { getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/reports";
import { EXPORT_KINDS, exportRows, isExportKind } from "@/server/data-export";
import { parseRange } from "@/server/reports";

/** Owner/manager data download as CSV (opens in Excel). Customer data is owner-only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getValidUser();
  if (!user?.restaurantId || !isExportKind(kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = kind === "customers" ? ["OWNER"] : ["OWNER", "MANAGER"];
  if (!allowed.includes(user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const rows = await exportRows(user.restaurantId, kind, range);
  if (kind === "customers") {
    await db.auditLog.create({ data: { restaurantId: user.restaurantId, userId: user.id, action: "CUSTOMERS_EXPORTED", details: { count: rows.length - 1 } } });
  }
  const name = EXPORT_KINDS[kind].dated ? `${kind}-${range.from}-to-${range.to}.csv` : `${kind}.csv`;
  return new NextResponse("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
