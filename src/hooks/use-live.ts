"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Polls the restaurant's change counter and refreshes server data when it moves.
 * `onChange` fires after the first load only, e.g. to play a sound for new orders.
 */
export function useLiveRefresh(opts: { orderToken?: string; intervalMs?: number; onChange?: () => void } = {}) {
  const router = useRouter();
  const version = useRef<number | null>(null);
  const onChange = useRef(opts.onChange);
  onChange.current = opts.onChange;

  useEffect(() => {
    let stopped = false;
    const url = `/api/live${opts.orderToken ? `?order=${encodeURIComponent(opts.orderToken)}` : ""}`;
    async function tick() {
      if (document.hidden) return;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: number };
        if (stopped) return;
        if (version.current !== null && v !== version.current) {
          router.refresh();
          onChange.current?.();
        }
        version.current = v;
      } catch {
        // Offline for a moment; try again on the next tick.
      }
    }
    tick();
    const id = setInterval(tick, opts.intervalMs ?? 3000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, opts.orderToken, opts.intervalMs]);
}

/** Short two-tone beep via Web Audio, so no sound file is needed. */
export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  } catch {}
}
