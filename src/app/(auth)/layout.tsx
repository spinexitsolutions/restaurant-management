import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/lib/utils";

const POINTS = ["QR ordering, POS, kitchen and waiter apps in one place", "GST-compliant invoices with CGST and SGST", "UPI, cards and Razorpay payments", "Works on any phone, tablet or laptop"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-stone-950 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_0%_0%,rgba(37,84,235,0.35),transparent)]" />
        <Link href="/" className="relative">
          <Logo inverted />
        </Link>
        <div className="relative my-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">The operating system for modern restaurants.</h2>
          <ul className="mt-8 space-y-3.5 text-stone-300">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-brand-300">
                  <Check size={13} strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-stone-500">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </aside>
      <main className="flex flex-col items-center justify-center bg-stone-50 px-4 py-10 sm:px-8">
        <Link href="/" className="mb-8 lg:hidden">
          <Logo />
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
