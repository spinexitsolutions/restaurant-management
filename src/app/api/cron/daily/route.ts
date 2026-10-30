import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs } from "@/server/whatsapp";

// Called once a day by Vercel Cron (see vercel.json) or any scheduler with the CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDailyJobs());
}
