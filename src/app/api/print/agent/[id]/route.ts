import { NextResponse, type NextRequest } from "next/server";
import { agentPrinter, finishJob } from "@/server/printing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const printer = await agentPrinter(req);
  if (!printer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  await finishJob(id, { printerId: printer.id }, !!body.ok, body.error);
  return NextResponse.json({ ok: true });
}
