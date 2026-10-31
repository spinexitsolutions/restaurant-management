import { Clock } from "lucide-react";
import { db } from "@/lib/db";
import { clockIn, clockOut } from "@/app/dashboard/attendance/actions";
import { translator, type T } from "@/lib/i18n";

/** Server component: shows the signed-in staff member's shift status with a clock in/out button. */
export async function ClockButton({ userId, compact, t = translator("en") }: { userId: string; compact?: boolean; t?: T }) {
  const open = await db.attendance.findFirst({ where: { userId, clockOut: null }, orderBy: { clockIn: "desc" } });
  const since = open?.clockIn.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return (
    <form action={open ? clockOut : clockIn} className={compact ? "" : "flex flex-wrap items-center gap-3"}>
      {!compact && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Clock size={16} /> {open ? t("clock.onShift", { time: since! }) : t("clock.notIn")}
        </p>
      )}
      <button
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium shadow-sm transition-colors ${
          open ? "bg-white text-stone-700 ring-1 ring-stone-300 ring-inset hover:bg-stone-50" : "bg-emerald-600 text-white hover:bg-emerald-700"
        } ${compact ? "w-full" : ""}`}
        title={open ? t("clock.onShift", { time: since! }) : undefined}
      >
        {open && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
        {open ? (compact ? t("clock.outSince", { time: since! }) : t("clock.out")) : t("clock.in")}
      </button>
    </form>
  );
}
