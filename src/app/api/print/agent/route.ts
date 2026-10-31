import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { columnsFor, toEscPos, type ReceiptDoc } from "@/lib/escpos";
import { agentPrinter } from "@/server/printing";

// Pending jobs for a LAN/USB printer served by the print agent, already rendered to ESC/POS.
export async function GET(req: NextRequest) {
  const printer = await agentPrinter(req);
  if (!printer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.printer.update({ where: { id: printer.id }, data: { lastSeenAt: new Date() } });
  const jobs = await db.printJob.findMany({ where: { printerId: printer.id, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 10 });
  const cols = columnsFor(printer.paperWidth);
  return NextResponse.json(
    {
      printer: { name: printer.name, address: printer.address },
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, escpos: Buffer.from(toEscPos(j.document as unknown as ReceiptDoc, cols)).toString("base64") })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
