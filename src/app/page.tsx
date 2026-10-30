import Link from "next/link";
import { BarChart3, ChefHat, IndianRupee, MessageCircle, QrCode, Receipt, UserRound, UtensilsCrossed, WifiOff } from "lucide-react";
import { APP_NAME } from "@/lib/utils";

const FEATURES = [
  { icon: QrCode, title: "QR menu & ordering", text: "Table-wise QR codes. Customers browse a mobile menu with photos, veg filter and add-ons, then order." },
  { icon: MessageCircle, title: "WhatsApp ordering", text: "Orders arrive on your WhatsApp with table number, items, notes and the full bill." },
  { icon: Receipt, title: "Fast POS billing", text: "Bill in a few taps. Split bills, merge tables, discounts and instant GST invoices." },
  { icon: IndianRupee, title: "GST done right", text: "Inclusive or exclusive pricing, automatic CGST + SGST split, item-wise rates and round-off." },
  { icon: ChefHat, title: "Kitchen display", text: "Orders show up live in the kitchen with timers, so nothing gets missed or delayed." },
  { icon: UserRound, title: "Waiter app", text: "Live table map, take orders at the table and get notified the moment food is ready." },
  { icon: WifiOff, title: "UPI, cards & Razorpay", text: "UPI QR with the bill amount, cash, card or your own Razorpay account. Split payments supported." },
  { icon: BarChart3, title: "Reports & staff", text: "Daily sales, best sellers, staff roles and an audit trail for every discount and cancellation." },
];

export default function Home() {
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <UtensilsCrossed size={16} />
          </span>
          {APP_NAME}
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
            Log in
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Free trial
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 pt-16 pb-20 text-center">
        <p className="mb-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          QR menu + POS + Kitchen + Waiter, all in one app
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          From ordering to billing, everything your restaurant needs
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600 text-pretty">
          Take orders from the table QR or WhatsApp, send them straight to the kitchen, and bill with GST in seconds. Works on any phone,
          tablet or laptop, with nothing to install.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
            Start 14-day free trial
          </Link>
          <Link href="/login" className="rounded-lg border border-stone-300 px-6 py-3 font-semibold text-stone-800 hover:bg-stone-50">
            Log in
          </Link>
        </div>
      </section>

      <section className="bg-stone-50 py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-white p-5 shadow-sm">
              <f.icon className="mb-3 text-brand-600" size={24} />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </div>
  );
}
