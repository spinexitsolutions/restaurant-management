import { CloudOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <CloudOff size={40} className="mb-3 text-stone-400" />
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        This page hasn&apos;t been opened on this device yet. Screens you have already opened (POS, tables, orders) keep working, and anything you
        save is synced when the internet is back.
      </p>
    </div>
  );
}
