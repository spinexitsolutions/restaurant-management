import { NextResponse, type NextRequest } from "next/server";
import { getValidUser } from "@/lib/auth";
import { finishJob } from "@/server/printing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getValidUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  await finishJob(id, { restaurantId: user.restaurantId }, !!body.ok, body.error);
  return NextResponse.json({ ok: true });
}
