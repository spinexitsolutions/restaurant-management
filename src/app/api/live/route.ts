import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getValidUser } from "@/lib/auth";

// Cheap change counter that panels poll. Staff use their session; customers pass the order token.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("order");
  let restaurantId: string | null = null;
  if (token) {
    const order = await db.order.findUnique({ where: { publicToken: token }, select: { restaurantId: true } });
    restaurantId = order?.restaurantId ?? null;
  } else {
    restaurantId = (await getValidUser())?.restaurantId ?? null;
  }
  if (!restaurantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { liveVersion: true } });
  return NextResponse.json({ v: r?.liveVersion ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
