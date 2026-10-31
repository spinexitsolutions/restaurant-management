import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ReceiptDoc, ReceiptLine } from "@/lib/escpos";
import { toPaise } from "@/lib/gst";
import { gstinState } from "@/lib/gstin";

type Tx = Prisma.TransactionClient;

const time = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
/** Rupee amount (Decimal or number of rupees) as "120.00". */
const money = (v: { toString(): string } | number) => Number(v.toString()).toFixed(2);

function orderLabel(o: { tableName: string | null; channel: string | null; channelRef: string | null; type: string; orderNumber: number }) {
  if (o.tableName) return `TABLE ${o.tableName}`;
  if (o.channel) return `${o.channel}${o.channelRef ? ` #${o.channelRef}` : ""}`;
  return `${o.type === "DELIVERY" ? "DELIVERY" : "TAKEAWAY"} #${o.orderNumber}`;
}

/**
 * Queues kitchen tickets for a KOT. Each active KOT printer gets the items for its station
 * (or every item if it has no station), so the tandoor printer only prints tandoor items.
 */
export async function enqueueKot(tx: Tx, restaurantId: string, kotId: string, opts: { cancelled?: { name: string; variantName: string | null; quantity: number; stationId: string | null; reason: string } } = {}) {
  const printers = await tx.printer.findMany({ where: { restaurantId, isActive: true, printKot: true }, include: { station: { select: { name: true } } } });
  if (!printers.length) return;
  const kot = await tx.kot.findUniqueOrThrow({ where: { id: kotId }, include: { order: true, items: { orderBy: { createdAt: "asc" } } } });
  const items = opts.cancelled ? [opts.cancelled] : kot.items.filter((i) => i.status !== "CANCELLED");

  for (const p of printers) {
    const mine = items.filter((i) => !p.stationId || i.stationId === p.stationId);
    if (!mine.length) continue;
    const lines: ReceiptLine[] = [
      { t: "text", text: opts.cancelled ? "*** CANCELLED ***" : `KOT ${kot.kotNumber}`, align: "center", big: true, bold: true },
      { t: "text", text: orderLabel(kot.order), align: "center", big: true },
      { t: "text", text: `${p.station?.name ?? "Kitchen"} · ${time(new Date())} · Order #${kot.order.orderNumber}`, align: "center" },
      { t: "rule" },
    ];
    for (const i of mine) {
      lines.push({ t: "text", text: `${i.quantity} x ${i.name}${i.variantName ? ` (${i.variantName})` : ""}`, bold: true, big: true });
      const addons = "addons" in i ? (i.addons as { name: string }[]).map((a) => a.name) : [];
      if (addons.length) lines.push({ t: "text", text: `  + ${addons.join(", ")}` });
      if ("note" in i && i.note) lines.push({ t: "text", text: `  NOTE: ${i.note}` });
    }
    if (opts.cancelled) lines.push({ t: "text", text: `Reason: ${opts.cancelled.reason}` });
    if (!opts.cancelled && kot.note) lines.push({ t: "rule" }, { t: "text", text: `NOTE: ${kot.note}`, bold: true });
    lines.push({ t: "feed", n: 2 });
    await tx.printJob.create({
      data: {
        restaurantId,
        printerId: p.id,
        kind: "KOT",
        title: `${opts.cancelled ? "Cancel" : "KOT"} ${kot.kotNumber} · ${orderLabel(kot.order)}`,
        document: { lines } satisfies ReceiptDoc as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/** Queues the customer bill on every printer set to print bills. */
export async function enqueueBill(tx: Tx, restaurantId: string, orderId: string) {
  const printers = await tx.printer.findMany({ where: { restaurantId, isActive: true, printBill: true } });
  if (!printers.length) return;
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } }, restaurant: true, payments: true } });
  const r = o.restaurant;
  const taxInvoice = o.gstEnabled && r.gstin;
  const lines: ReceiptLine[] = [
    { t: "text", text: r.name, align: "center", bold: true, big: true },
    ...(r.address ? [{ t: "text" as const, text: r.address, align: "center" as const }] : []),
    ...(r.phone ? [{ t: "text" as const, text: `Ph: ${r.phone}`, align: "center" as const }] : []),
    ...(taxInvoice ? [{ t: "text" as const, text: `GSTIN: ${r.gstin}`, align: "center" as const }] : []),
    ...(r.fssaiNumber ? [{ t: "text" as const, text: `FSSAI: ${r.fssaiNumber}`, align: "center" as const }] : []),
    { t: "rule" },
    { t: "text", text: taxInvoice ? "TAX INVOICE" : "BILL", align: "center", bold: true },
    { t: "text", text: `Bill: ${o.invoiceNumber}` },
    { t: "text", text: `${(o.billedAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` },
    { t: "text", text: `${orderLabel(o)} · Order #${o.orderNumber}` },
  ];
  if (o.buyerGstin) lines.push({ t: "text", text: `Billed to: ${o.buyerName}` }, { t: "text", text: `GSTIN: ${o.buyerGstin}` });
  else if (o.customerName) lines.push({ t: "text", text: `Customer: ${o.customerName}` });
  lines.push({ t: "rule" });
  for (const i of o.items) lines.push({ t: "row", left: `${i.quantity} x ${i.name}${i.variantName ? ` (${i.variantName})` : ""}`, right: money(Number(i.unitPrice) * i.quantity) });
  lines.push({ t: "rule" }, { t: "row", left: "Sub total", right: money(o.subtotal ?? 0) });
  if (toPaise(o.discountAmount ?? 0) > 0) lines.push({ t: "row", left: "Discount", right: `-${money(o.discountAmount!)}` });
  if (toPaise(o.serviceCharge ?? 0) > 0) lines.push({ t: "row", left: "Service charge", right: money(o.serviceCharge!) });
  if (toPaise(o.cgst ?? 0) > 0) lines.push({ t: "row", left: "CGST", right: money(o.cgst!) }, { t: "row", left: "SGST", right: money(o.sgst!) });
  if (toPaise(o.roundOff ?? 0) !== 0) lines.push({ t: "row", left: "Round off", right: money(o.roundOff!) });
  lines.push({ t: "rule" }, { t: "row", left: "GRAND TOTAL", right: `Rs ${money(o.grandTotal ?? 0)}`, bold: true }, { t: "rule" });
  if (taxInvoice) lines.push({ t: "text", text: `SAC 996331 · Place of supply: ${r.state || gstinState(r.gstin!) || "-"}` });
  if (o.channel) lines.push({ t: "text", text: `GST paid by ${o.channel} under Sec 9(5)` });
  lines.push({ t: "text", text: "Thank you! Visit again", align: "center" }, { t: "feed", n: 2 });
  for (const p of printers) {
    await tx.printJob.create({ data: { restaurantId, printerId: p.id, kind: "BILL", title: `Bill ${o.invoiceNumber}`, document: { lines } as unknown as Prisma.InputJsonValue } });
  }
}

export async function enqueueTestPrint(restaurantId: string, printerId: string) {
  const p = await db.printer.findFirst({ where: { id: printerId, restaurantId }, include: { restaurant: { select: { name: true } } } });
  if (!p) return false;
  const lines: ReceiptLine[] = [
    { t: "text", text: "TEST PRINT", align: "center", big: true, bold: true },
    { t: "text", text: p.restaurant.name, align: "center" },
    { t: "text", text: `${p.name} · ${p.paperWidth}mm`, align: "center" },
    { t: "rule" },
    { t: "row", left: "2 x Paneer Tikka", right: "520.00" },
    { t: "row", left: "1 x Butter Naan with a very long name to test wrapping", right: "60.00" },
    { t: "rule" },
    { t: "text", text: "If this looks right, printing works!", align: "center" },
    { t: "feed", n: 2 },
  ];
  await db.printJob.create({ data: { restaurantId, printerId, kind: "TEST", title: "Test print", document: { lines } as unknown as Prisma.InputJsonValue } });
  return true;
}

const MAX_ATTEMPTS = 5;

/** Marks a job printed, or counts a failure (failed for good after 5 tries). */
export async function finishJob(jobId: string, where: Prisma.PrintJobWhereInput, ok: boolean, error?: string) {
  const job = await db.printJob.findFirst({ where: { id: jobId, ...where } });
  if (!job || job.status !== "PENDING") return;
  if (ok) await db.printJob.update({ where: { id: jobId }, data: { status: "PRINTED", printedAt: new Date(), attempts: { increment: 1 } } });
  else
    await db.printJob.update({
      where: { id: jobId },
      data: { attempts: { increment: 1 }, error: error?.slice(0, 200), status: job.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING" },
    });
}

/** Re-queues the KOT or bill for an order (staff pressed "Reprint"). */
export async function reprint(restaurantId: string, orderId: string, kind: "KOT" | "BILL") {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { kots: { where: { status: "ACCEPTED" }, select: { id: true } } } });
    if (!order) return 0;
    if (kind === "BILL") {
      if (order.status !== "BILLED" && order.status !== "PAID") return 0;
      await enqueueBill(tx, restaurantId, orderId);
    } else for (const k of order.kots) await enqueueKot(tx, restaurantId, k.id);
    return tx.printJob.count({ where: { restaurantId, status: "PENDING", createdAt: { gte: new Date(Date.now() - 5000) } } });
  });
}

/** The printer's secret token, sent by the print agent as "Authorization: Bearer <token>". */
export async function agentPrinter(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token.length < 20) return null;
  return db.printer.findFirst({ where: { agentToken: token, isActive: true, restaurant: { isActive: true } } });
}

