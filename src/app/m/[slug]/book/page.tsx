import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { istDate } from "@/lib/numbering";
import { BookingForm } from "./booking-form";

export const metadata = { title: "Book a table" };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await db.restaurant.findUnique({ where: { slug }, select: { name: true, slug: true, isActive: true, reservationsEnabled: true, menuThemeColor: true, address: true, city: true, phone: true } });
  if (!r || !r.isActive) notFound();
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white" style={{ "--theme": r.menuThemeColor } as React.CSSProperties}>
      <header className="px-5 pt-8 pb-6 text-white" style={{ background: "var(--theme)" }}>
        <p className="text-sm opacity-90">{[r.address, r.city].filter(Boolean).join(", ")}</p>
        <h1 className="text-2xl font-bold">{r.name}</h1>
        <p className="mt-1 text-sm opacity-90">Book a table</p>
      </header>
      <main className="p-5">
        {r.reservationsEnabled ? (
          <BookingForm slug={r.slug} today={istDate()} />
        ) : (
          <p className="text-sm text-stone-600">Online booking isn&apos;t available right now.{r.phone && ` Please call ${r.phone}.`}</p>
        )}
      </main>
    </div>
  );
}
