import Link from "next/link";
import { logout } from "../(auth)/actions";
import { requireSuperAdmin } from "@/server/admin";
import { LogoMark } from "@/components/logo";
import { APP_NAME } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <span className="flex items-center gap-2.5 font-semibold">
            <LogoMark size={28} /> {APP_NAME}
            <span className="rounded-md bg-stone-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">Admin</span>
          </span>
          <nav className="flex gap-1 text-sm">
            <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-stone-100">
              Restaurants
            </Link>
            <Link href="/admin/resellers" className="rounded-lg px-3 py-1.5 hover:bg-stone-100">
              Partners
            </Link>
          </nav>
          <span className="ml-auto text-sm text-stone-500">{admin.name}</span>
          <form action={logout}>
            <button className="text-sm text-stone-600 hover:text-red-600">Log out</button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-7xl p-6">{children}</div>
    </div>
  );
}
