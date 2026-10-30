import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AddStaffForm, StaffRowControls } from "./staff-controls";

export const metadata = { title: "Staff" };

const ROLE_INFO: Record<string, string> = {
  OWNER: "Full access, billing settings and subscription",
  MANAGER: "Menu, tables, staff, reports, discounts",
  CASHIER: "POS billing and payments",
  WAITER: "Take orders and manage tables",
  CHEF: "Kitchen display only",
};

export default async function StaffPage() {
  const session = await requireRestaurantSession(MANAGE_ROLES);
  const staff = await db.user.findMany({
    where: { restaurantId: session.restaurantId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Staff" description="Each person gets their own login. What they can see depends on their role." />
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Add staff member</h2>
        <AddStaffForm canAddManager={session.role === "OWNER"} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {staff.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {u.name} {u.id === session.userId && <span className="text-stone-400">(you)</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.role === "OWNER" ? "brand" : "stone"}>{u.role}</Badge>
                  <p className="mt-1 text-xs text-stone-500">{ROLE_INFO[u.role]}</p>
                </td>
                <td className="px-4 py-3 text-stone-500">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-IN") : "Never"}</td>
                <td className="px-4 py-3 text-right">
                  {u.role !== "OWNER" && u.id !== session.userId && (session.role === "OWNER" || u.role !== "MANAGER") && (
                    <StaffRowControls id={u.id} role={u.role} isActive={u.isActive} canAssignManager={session.role === "OWNER"} />
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
