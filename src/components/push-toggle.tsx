"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/app/dashboard/push-actions";
import { useT } from "./i18n";

function keyBytes(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "blocked" | "off" | "on" | "failed";

/** Turns phone alerts on/off for this device. Hidden when the server has no VAPID keys. */
export function PushToggle({ publicKey, compact }: { publicKey: string | null; compact?: boolean }) {
  const t = useT();
  const [state, setState] = useState<State>("loading");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!publicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    navigator.serviceWorker.ready
      .then(async (reg) => {
        if ((await reg.pushManager.permissionState({ userVisibleOnly: true })) === "denied") return setState("blocked");
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      })
      .catch(() => setState("unsupported"));
  }, [publicKey]);

  if (!publicKey || state === "loading") return null;
  if (compact && (state === "unsupported" || state === "blocked")) {
    const msg = t(state === "blocked" ? "push.blocked" : "push.unsupported");
    return (
      <span title={msg} aria-label={msg} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-300 ring-1 ring-stone-200 ring-inset">
        <BellOff size={16} />
      </span>
    );
  }
  if (state === "unsupported" || state === "blocked") {
    return <p className="text-xs text-stone-500">{t(state === "blocked" ? "push.blocked" : "push.unsupported")}</p>;
  }
  const failed = state === "failed";

  const toggle = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (state === "on") {
        if (existing) {
          await removePushSubscription(existing.endpoint);
          await existing.unsubscribe();
        }
        return setState("off");
      }
      try {
        const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        await savePushSubscription(sub.toJSON());
      } catch {
        // Permission refused, or the browser's push service couldn't be reached.
        const perm = await reg.pushManager.permissionState({ userVisibleOnly: true });
        return setState(perm === "denied" ? "blocked" : "failed");
      }
      setState("on");
    });

  const button = (
    <button
      onClick={toggle}
      disabled={pending}
      className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium shadow-xs ring-1 ring-inset ${state === "on" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"}`}
    >
      {state === "on" ? <BellRing size={16} /> : <BellOff size={16} />}
      {state === "on" ? t("push.on") : t("push.enable")}
    </button>
  );
  if (compact) {
    const label = failed ? t("push.failed") : state === "on" ? t("push.on") : t("push.enable");
    return (
      <button
        onClick={toggle}
        disabled={pending}
        title={label}
        aria-label={label}
        aria-pressed={state === "on"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs ring-1 ring-inset ${
          state === "on" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : failed ? "bg-red-50 text-red-600 ring-red-200" : "bg-white text-stone-500 ring-stone-300 hover:bg-stone-50"
        }`}
      >
        {state === "on" ? <BellRing size={16} /> : <BellOff size={16} />}
      </button>
    );
  }
  return failed ? (
    <div className="space-y-1">
      {button}
      <p className="text-xs text-red-600">{t("push.failed")}</p>
    </div>
  ) : (
    button
  );
}
