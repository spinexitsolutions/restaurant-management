import { Badge } from "@/components/ui";
import type { AdminRow } from "@/server/admin";

export function PlanBadge({ r }: { r: Pick<AdminRow, "plan" | "state" | "daysLeft" | "isActive"> }) {
  if (!r.isActive) return <Badge tone="red">Suspended</Badge>;
  if (r.state === "EXPIRED") return <Badge tone="red">Expired</Badge>;
  if (r.state === "GRACE") return <Badge tone="amber">Grace</Badge>;
  const label = r.plan === "TRIAL" ? "Trial" : "Paid";
  return <Badge tone={r.daysLeft <= 7 ? "amber" : r.plan === "TRIAL" ? "brand" : "green"}>{Number.isFinite(r.daysLeft) ? `${label} · ${r.daysLeft}d` : label}</Badge>;
}
