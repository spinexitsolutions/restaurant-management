import { notFound } from "next/navigation";
import { displayRestaurant, tokenBoard } from "@/server/tokens";
import { TokenDisplay } from "./display";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order status", robots: { index: false } };

/** Public "order ready" screen for a TV at the counter. The URL key is the only access control. */
export default async function TokenDisplayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const r = await displayRestaurant(key);
  if (!r || !r.isActive) notFound();
  const board = await tokenBoard(r.id);
  return <TokenDisplay name={r.name} logoUrl={r.logoUrl} color={r.menuThemeColor} enabled={r.tokenMode} preparing={board.preparing.map((t) => t.token)} ready={board.ready.map((t) => ({ token: t.token, label: t.label }))} />;
}
