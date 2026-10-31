import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { aiImportEnabled } from "@/server/menu-import";
import { MenuImporter } from "./importer";

export const metadata = { title: "Import menu" };

export default async function MenuImportPage() {
  await requireRestaurantSession(MANAGE_ROLES);
  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/menu" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={14} /> Menu
      </Link>
      <PageHeader title="Import menu" description="Bring your whole menu in at once from Excel, CSV or photos of the printed menu. You check everything before it is saved." />
      <MenuImporter aiEnabled={aiImportEnabled()} />
    </div>
  );
}
