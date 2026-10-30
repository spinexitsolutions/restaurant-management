import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { APP_NAME } from "@/lib/utils";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-stone-50 px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-xl font-bold text-stone-900">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <UtensilsCrossed size={18} />
        </span>
        {APP_NAME}
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
