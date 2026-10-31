import { requireRestaurantSession } from "@/lib/auth";
import { getFloor } from "@/server/floor";
import { BILLING_ROLES } from "@/server/orders";
import { todayStats } from "@/server/stats";
import { PosScreen } from "./pos-screen";

export const metadata = { title: "POS" };

export default async function PosPage() {
  const session = await requireRestaurantSession(BILLING_ROLES);
  const [floor, stats] = await Promise.all([getFloor(session.restaurantId), todayStats(session.restaurantId)]);
  return <PosScreen title="nav.pos" tables={floor.tables} others={floor.others} stats={stats} recentPayments={floor.recentPayments} tokens={floor.tokens} />;
}
