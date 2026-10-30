"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushOutbox, onOutboxChange, readOutbox, type OutboxOp } from "@/lib/outbox";
import { sendKot, takePayment } from "@/app/dashboard/orders/actions";

function runOp(op: OutboxOp) {
  if (op.kind === "sendKot") return sendKot(op.payload as Parameters<typeof sendKot>[0]);
  return takePayment(op.orderId, op.payload as Parameters<typeof takePayment>[1]);
}

/** Shows connection status and syncs the offline outbox when the connection returns. */
export function OfflineBar() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (syncing || readOutbox().length === 0 || !navigator.onLine) return;
    setSyncing(true);
    const { sent, failed } = await flushOutbox(runOp);
    setSyncing(false);
    if (sent || failed.length) {
      router.refresh();
      setNotice(
        [sent && `${sent} offline entr${sent === 1 ? "y" : "ies"} synced.`, ...failed.map((f) => `Not saved: ${f.label} (${f.error})`)].filter(Boolean).join(" "),
      );
    }
  }, [router, syncing]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setPending(readOutbox().length);
    };
    update();
    const goOnline = () => {
      update();
      sync();
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", update);
    const off = onOutboxChange(update);
    const id = setInterval(sync, 15000);
    sync();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", update);
      off();
      clearInterval(id);
    };
  }, [sync]);

  if (online && pending === 0 && !notice) return null;
  return (
    <div className="no-print sticky top-0 z-40">
      {!online && (
        <div className="flex items-center gap-2 bg-stone-900 px-4 py-2 text-sm text-white">
          <CloudOff size={16} /> You&apos;re offline. New KOTs and payments are saved on this device and will sync automatically.
        </div>
      )}
      {pending > 0 && (
        <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          {pending} entr{pending === 1 ? "y" : "ies"} waiting to sync
          {online && (
            <button onClick={sync} disabled={syncing} className="ml-auto flex items-center gap-1 rounded bg-white/70 px-2 py-0.5 font-medium">
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sync now
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 bg-green-100 px-4 py-2 text-sm text-green-900">
          {notice}
          <button onClick={() => setNotice(null)} className="ml-auto text-xs underline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
