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
        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${open ? "bg-stone-900 text-white" : "bg-green-600 text-white"} ${compact ? "w-full" : ""}`}
        title={open ? t("clock.onShift", { time: since! }) : undefined}
      >
        {open ? (compact ? t("clock.outSince", { time: since! }) : t("clock.out")) : t("clock.in")}
      </button>
    </form>
  );
}
