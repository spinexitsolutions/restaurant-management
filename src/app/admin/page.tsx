import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { logout } from "../(auth)/actions";

export const metadata = { title: "Super admin" };

async function requireSuperAdmin() {
  const session = await getSession();
  const user = session && (await db.user.findUnique({ where: { id: session.userId }, select: { role: true, isActive: true } }));
  if (!user || !user.isActive || user.role !== "SUPER_ADMIN") redirect("/login");
}

async function toggleRestaurant(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const r = await db.restaurant.findUnique({ where: { id }, select: { isActive: true } });
  if (r) await db.restaurant.update({ where: { id }, data: { isActive: !r.isActive } });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  await requireSuperAdmin();
  const restaurants = await db.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { menuItems: true, tables: true, users: true } }, users: { where: { role: "OWNER" }, select: { name: true, email: true, phone: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="All restaurants"
        description={`${restaurants.length} restaurant(s) on the platform`}
        actions={
          <form action={logout}>
            <button className="text-sm text-stone-600 hover:text-red-600">Log out</button>
          </form>
        }
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {restaurants.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <a href={`/m/${r.slug}`} target="_blank" className="font-medium hover:underline">
                    {r.name}
                  </a>
                  <p className="text-xs text-stone-500">{r.city ?? "-"}</p>
                </td>
                <td className="px-4 py-3">
                  {r.users[0]?.name}
                  <p className="text-xs text-stone-500">{[r.users[0]?.email, r.users[0]?.phone].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={r.plan === "TRIAL" ? "amber" : "green"}>{r.plan}</Badge>
                  {r.planExpiresAt && <p className="mt-1 text-xs text-stone-500">till {r.planExpiresAt.toLocaleDateString("en-IN")}</p>}
                </td>
                <td className="px-4 py-3 text-stone-600">
                  {r._count.menuItems} items · {r._count.tables} tables · {r._count.users} staff
                </td>
                <td className="px-4 py-3 text-stone-600">{r.createdAt.toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleRestaurant}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className={`text-sm ${r.isActive ? "text-red-600" : "text-green-700"}`}>{r.isActive ? "Suspend" : "Activate"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
