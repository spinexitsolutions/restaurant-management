import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChefHat,
  ClipboardCheck,
  Languages,
  LayoutGrid,
  MonitorSmartphone,
  QrCode,
  Receipt,
  ShieldCheck,
  Store,
  Tv,
  Users,
  WifiOff,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { PLANS } from "@/lib/plans";
import { APP_NAME } from "@/lib/utils";

const MODULES = [
  { icon: QrCode, title: "QR ordering", text: "Table-wise QR menus with photos, variants and add-ons. Guests order, call the waiter, pay and rate from their phone." },
  { icon: Receipt, title: "POS and GST billing", text: "Inclusive or exclusive GST, automatic CGST/SGST, B2B invoices with buyer GSTIN, split bills and multiple payment modes." },
  { icon: ChefHat, title: "Kitchen display", text: "Live tickets by station with timers, course firing and automatic KOT printing on thermal printers." },
  { icon: Users, title: "Waiter app", text: "Live table map, order taking at the table and instant alerts on the phone when food is ready." },
  { icon: Tv, title: "Counter and token display", text: "Token numbers for cafes and QSRs with an order-ready screen for the TV that calls out tokens." },
  { icon: Boxes, title: "Inventory and recipes", text: "Recipe-based stock deduction, low-stock alerts, purchase entries and automatic sold-out on the menu." },
  { icon: BarChart3, title: "Reports and insights", text: "Day close, sales register for your CA, item and staff performance, and plain-language insights." },
  { icon: ClipboardCheck, title: "CRM and loyalty", text: "Customer history, loyalty points, coupon codes, birthday wishes and win-back campaigns on WhatsApp." },
  { icon: Store, title: "Multi-outlet", text: "Run every branch from one login, copy menus between outlets and compare performance." },
];

const ASSURANCES = [
  { icon: ShieldCheck, title: "Secure by design", text: "Role-based access, manager PIN approvals and a full audit trail for every discount and cancellation." },
  { icon: WifiOff, title: "Keeps working offline", text: "Orders taken during an internet outage are queued on the device and synced automatically." },
  { icon: Languages, title: "Staff app in their language", text: "English, Hindi and Marathi for waiters, chefs and cashiers, set per person." },
  { icon: MonitorSmartphone, title: "No special hardware", text: "Runs in the browser on any phone, tablet or laptop. Use the printers you already have." },
];

const STEPS = [
  { title: "Create your account", text: "Sign up in two minutes. A sample menu and tables are ready so you can try everything immediately." },
  { title: "Add your menu", text: "Import from Excel or a photo of your printed menu, set GST and print table QR codes." },
  { title: "Start serving", text: "Invite your team. Orders flow from table to kitchen to bill, and the owner sees it all live." },
];

const FAQ = [
  { q: "Do I need to buy any hardware?", a: "No. It works in the browser on devices you already own. Thermal printers over USB, Bluetooth or the network are supported if you want printed KOTs and bills." },
  { q: "Is GST handled correctly?", a: "Yes. Prices can include or exclude GST, the bill splits CGST and SGST automatically, invoice numbers follow the financial year, and B2B bills carry the buyer's GSTIN." },
  { q: "How do customers pay?", a: "Cash, card, UPI QR with the exact amount, or online through your own Razorpay account. A bill can be split across several payment modes." },
  { q: "Can I take my data out?", a: "Anytime. Orders, payments, customers, menu and stock export to Excel-ready files, and your menu can be imported back in the same format." },
  { q: "What happens after the free trial?", a: "Choose a monthly, quarterly or yearly plan. Your menu, orders and settings stay exactly as they are." },
];

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

function ProductPreview() {
  const tables = [
    ["T1", "free"],
    ["T2", "busy", "₹1,240"],
    ["T3", "busy", "₹860"],
    ["T4", "billed", "₹2,105"],
    ["T5", "free"],
    ["T6", "busy", "₹540"],
    ["T7", "free"],
    ["T8", "busy", "₹1,780"],
  ] as const;
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-tr from-brand-100 via-white to-sky-100 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-elevated">
        <div className="flex items-center gap-1.5 border-b border-stone-200 bg-stone-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
          <span className="ml-3 text-xs text-stone-500">POS · Today</span>
        </div>
        <div className="grid grid-cols-[1fr_190px]">
          <div className="p-4">
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                ["Sales", "₹48,250"],
                ["Bills", "63"],
                ["Running", "9"],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-stone-200 px-2.5 py-2">
                  <p className="text-[10px] font-medium tracking-wide text-stone-500 uppercase">{l}</p>
                  <p className="text-sm font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {tables.map(([name, state, amt]) => (
                <div
                  key={name}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-center ring-1 ${
                    state === "free" ? "ring-stone-200" : state === "billed" ? "bg-amber-50 ring-amber-300" : "bg-brand-50 ring-brand-300"
                  }`}
                >
                  <span className="text-sm font-semibold">{name}</span>
                  {amt && <span className="text-[10px] text-stone-600">{amt}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="border-l border-stone-200 p-4 text-xs">
            <p className="mb-2 font-semibold">Table T2</p>
            {[
              ["2 × Paneer Tikka", "520.00"],
              ["1 × Dal Makhani", "300.00"],
              ["4 × Butter Naan", "240.00"],
              ["2 × Sweet Lassi", "180.00"],
            ].map(([n, p]) => (
              <div key={n} className="flex justify-between py-0.5 text-stone-600">
                <span>{n}</span>
                <span>{p}</span>
              </div>
            ))}
            <div className="mt-2 space-y-0.5 border-t border-stone-200 pt-2 text-stone-500">
              <div className="flex justify-between">
                <span>CGST 2.5%</span>
                <span>31.00</span>
              </div>
              <div className="flex justify-between">
                <span>SGST 2.5%</span>
                <span>31.00</span>
              </div>
            </div>
            <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>₹1,302</span>
            </div>
            <div className="mt-3 rounded-md bg-brand-600 py-1.5 text-center font-semibold text-white">Generate bill</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-white text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={APP_NAME}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex">
            <a href="#modules" className="hover:text-stone-900">
              Product
            </a>
            <a href="#how" className="hover:text-stone-900">
              How it works
            </a>
            <a href="#pricing" className="hover:text-stone-900">
              Pricing
            </a>
            <a href="#faq" className="hover:text-stone-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_0%,var(--color-brand-50),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" /> Restaurant management platform for India
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[56px]">
              Run your entire restaurant from one system
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600 text-pretty">
              QR ordering, POS with GST billing, kitchen display, waiter app, inventory and reports, connected in real time. Built for dine-in restaurants, cafes,
              QSRs and cloud kitchens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                Start 14-day free trial <ArrowRight size={16} />
              </Link>
              <a href="#modules" className="inline-flex items-center rounded-lg px-5 py-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 ring-inset hover:bg-stone-50">
                Explore the product
              </a>
            </div>
            <ul className="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-2 text-sm text-stone-600">
              {["No card required", "GST-compliant invoices", "UPI, cards and Razorpay", "Setup in under 15 minutes"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check size={16} className="text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-stone-200 px-5 md:grid-cols-4 md:divide-x">
          {[
            ["One platform", "Front of house to back office"],
            ["Real-time", "Table, kitchen and counter in sync"],
            ["Any device", "Phone, tablet or laptop"],
            ["Your data", "Export everything, anytime"],
          ].map(([a, b]) => (
            <div key={a} className="px-4 py-7 md:px-6">
              <p className="text-base font-semibold">{a}</p>
              <p className="mt-1 text-sm text-stone-500">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="modules" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700">Product</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Every part of service, connected</h2>
            <p className="mt-4 text-lg text-stone-600">Each module works on its own and gets better together. An order placed at the table reaches the kitchen, the bill and the reports without anyone retyping it.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.title} className="bg-white p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <m.icon size={20} />
                </span>
                <h3 className="mt-5 font-semibold">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-stone-950 py-24 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="text-sm font-semibold text-brand-300">Built for Indian restaurants</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Reliable on the busiest night of the year</h2>
              <p className="mt-4 text-stone-400">Designed around how Indian restaurants actually run: GST rules, UPI payments, WhatsApp, aggregator orders and staff who prefer their own language.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {ASSURANCES.map((a) => (
                <div key={a.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                  <a.icon size={20} className="text-brand-300" />
                  <h3 className="mt-4 font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-sm font-semibold text-brand-700">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Live in an afternoon</h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-t-2 border-stone-200 pt-6">
                <span className="absolute -top-[2px] left-0 h-[2px] w-12 bg-brand-600" />
                <p className="text-sm font-semibold text-brand-700">Step {i + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-t border-stone-200 bg-stone-50 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-brand-700">Pricing</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing per outlet</h2>
            <p className="mt-4 text-stone-600">Every plan includes every module, unlimited orders, staff and tables. Prices exclude GST.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => {
              const featured = p.code === "YEARLY";
              return (
                <div key={p.code} className={`relative flex flex-col rounded-2xl bg-white p-7 ${featured ? "shadow-elevated ring-2 ring-brand-600" : "border border-stone-200 shadow-card"}`}>
                  {featured && <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">Best value</span>}
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{rupees(p.pricePaise)}</span>
                    <span className="text-sm text-stone-500">/ {p.months === 1 ? "month" : `${p.months} months`}</span>
                  </p>
                  <p className="mt-1 h-5 text-sm text-stone-500">{p.months > 1 ? `${rupees(Math.round(p.pricePaise / p.months / 100) * 100)} per month` : "Billed monthly"}</p>
                  {p.note && <p className="mt-3 text-sm font-medium text-emerald-700">{p.note}</p>}
                  <ul className="mt-6 mb-8 space-y-2.5 text-sm text-stone-600">
                    {["All modules included", "Unlimited orders and staff", "Free updates and support"].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check size={16} className="text-brand-600" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-auto rounded-lg py-2.5 text-center text-sm font-semibold ${featured ? "bg-brand-600 text-white hover:bg-brand-700" : "text-stone-900 ring-1 ring-stone-300 ring-inset hover:bg-stone-50"}`}
                  >
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="text-sm font-semibold text-brand-700">FAQ</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
            <p className="mt-4 text-stone-600">Anything else? Start the free trial and reach us from inside the app.</p>
          </div>
          <div className="divide-y divide-stone-200 border-y border-stone-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-xl leading-none text-stone-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl bg-brand-700 px-8 py-12 text-white md:flex-row md:items-center md:px-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ready to run a smoother service?</h2>
            <p className="mt-2 text-brand-100">Try every feature free for 14 days. No card required.</p>
          </div>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-800 hover:bg-brand-50">
            Create your account <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-stone-500 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <LogoMark size={24} />
            <span>
              © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
            </span>
          </div>
          <nav className="flex flex-wrap gap-6">
            <a href="#modules" className="hover:text-stone-900">
              Product
            </a>
            <a href="#pricing" className="hover:text-stone-900">
              Pricing
            </a>
            <Link href="/login" className="hover:text-stone-900">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-stone-900">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
