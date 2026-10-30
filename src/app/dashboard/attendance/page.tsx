import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { formatHours, shiftMs, summarize } from "@/lib/attendance";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { Badge, Card, PageHeader } from "@/components/ui";
import { closeShift } from "./actions";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : istDate().slice(0, 7);
  const today = istDate();

  const [staff, rows] = await Promise.all([
    db.user.findMany({ where: { restaurantId, isActive: true }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } }),
    db.attendance.findMany({ where: { restaurantId, businessDate: { startsWith: month } }, orderBy: { clockIn: "desc" }, include: { user: { select: { name: true } } } }),
  ]);
  const summary = summarize(rows);
  const todayRows = rows.filter((r) => r.businessDate === today);
  const fmt = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Attendance" description="Staff clock in and out from their Overview page." />
      <form className="mb-6 flex items-center gap-2">
        <input type="month" name="month" defaultValue={month} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" aria-label="Month" />
        <button className="h-10 rounded-lg bg-white px-4 text-sm ring-1 ring-stone-300">Show</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Month summary</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="px-5 pb-2 font-medium">Staff</th>
                <th className="px-5 pb-2 text-right font-medium">Days</th>
                <th className="px-5 pb-2 text-right font-medium">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {staff.map((u) => {
                const s = summary.get(u.id);
                return (
                  <tr key={u.id}>
                    <td className="px-5 py-2">
                      {u.name} <span className="text-xs text-stone-400">{u.role.toLowerCase()}</span>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{s?.days ?? 0}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{s?.hours ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="p-0">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Today</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {staff.map((u) => {
              const shifts = todayRows.filter((r) => r.userId === u.id);
              return (
                <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2">
                  <span>{u.name}</span>
                  {shifts.length === 0 ? (
                    <Badge>Absent</Badge>
                  ) : (
                    <span className="text-right text-xs text-stone-600">
                      {shifts
                        .slice()
                        .reverse()
                        .map((r) => `${fmt(r.clockIn)} – ${r.clockOut ? fmt(r.clockOut) : "now"}`)
                        .join(", ")}
                      {shifts.some((r) => !r.clockOut) && (
                        <Badge tone="green" className="ml-2">
                          On shift
                        </Badge>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">In</th>
              <th className="px-4 py-3 font-medium">Out</th>
              <th className="px-4 py-3 text-right font-medium">Worked</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  No attendance this month.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.businessDate}</td>
                <td className="px-4 py-2">{r.user.name}</td>
                <td className="px-4 py-2">{fmt(r.clockIn)}</td>
                <td className="px-4 py-2">{r.clockOut ? fmt(r.clockOut) : <Badge tone="green">On shift</Badge>}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatHours(shiftMs(r.clockIn, r.clockOut))}</td>
                <td className="px-4 py-2 text-right">
                  {!r.clockOut && (
                    <form action={closeShift.bind(null, r.id)}>
                      <button className="text-xs text-red-600 hover:underline">Clock out now</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
