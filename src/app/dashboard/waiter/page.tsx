import { requireRestaurantSession } from "@/lib/auth";
import { getFloor } from "@/server/floor";
import { ORDER_ROLES } from "@/server/orders";
import { PosScreen } from "../pos/pos-screen";

export const metadata = { title: "Waiter" };

export default async function WaiterPage() {
  const session = await requireRestaurantSession(ORDER_ROLES);
  const floor = await getFloor(session.restaurantId);
  return <PosScreen title="nav.tables" tables={floor.tables} others={floor.others} stats={null} />;
}
