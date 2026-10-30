import { Clock } from "lucide-react";
import { db } from "@/lib/db";
import { clockIn, clockOut } from "@/app/dashboard/attendance/actions";

/** Server component: shows the signed-in staff member's shift status with a clock in/out button. */
export async function ClockButton({ userId, compact }: { userId: string; compact?: boolean }) {
  const open = await db.attendance.findFirst({ where: { userId, clockOut: null }, orderBy: { clockIn: "desc" } });
  const since = open?.clockIn.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  return (
    <form action={open ? clockOut : clockIn} className={compact ? "" : "flex flex-wrap items-center gap-3"}>
      {!compact && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Clock size={16} /> {open ? `On shift since ${since}` : "You are not clocked in"}
        </p>
      )}
      <button
        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${open ? "bg-stone-900 text-white" : "bg-green-600 text-white"} ${compact ? "w-full" : ""}`}
        title={open ? `On shift since ${since}` : undefined}
      >
        {open ? (compact ? `Clock out (in since ${since})` : "Clock out") : "Clock in"}
      </button>
    </form>
  );
}
