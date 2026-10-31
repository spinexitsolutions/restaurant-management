import { NextResponse, type NextRequest } from "next/server";
import { getValidUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Pending jobs for a printer driven by a browser print station (signed-in staff device).
export async function GET(req: NextRequest) {
  const user = await getValidUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const printerId = req.nextUrl.searchParams.get("printer") ?? "";
  const printer = await db.printer.findFirst({ where: { id: printerId, restaurantId: user.restaurantId } });
  if (!printer) return NextResponse.json({ error: "not found" }, { status: 404 });
  await db.printer.update({ where: { id: printer.id }, data: { lastSeenAt: new Date() } });
  const jobs = await db.printJob.findMany({
    where: { printerId: printer.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, kind: true, title: true, document: true, createdAt: true },
  });
  return NextResponse.json({ paperWidth: printer.paperWidth, jobs }, { headers: { "Cache-Control": "no-store" } });
}
