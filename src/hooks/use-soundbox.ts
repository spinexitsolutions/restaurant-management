"use client";

import { useEffect, useRef } from "react";
import { beep } from "./use-live";

/** Says "₹540 received" out loud, like a UPI soundbox (Hindi voice when the device has one). */
export function announcePayment(paise: number) {
  beep();
  try {
    const rupees = Math.round(paise / 100);
    const voices = window.speechSynthesis.getVoices();
    const hindi = voices.find((v) => v.lang.toLowerCase().startsWith("hi"));
    const u = new SpeechSynthesisUtterance(hindi ? `${rupees} रुपये प्राप्त हुए` : `Received ${rupees} rupees`);
    u.lang = hindi ? hindi.lang : "en-IN";
    if (hindi) u.voice = hindi;
    setTimeout(() => window.speechSynthesis.speak(u), 400);
  } catch {
    // No speech on this device; the beep still played.
  }
}

/** Announces payments that weren't there when the screen first loaded. */
export function useSoundbox(payments: { id: string; amount: number; online: boolean }[], enabled = true) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(payments.map((p) => p.id));
      return;
    }
    for (const p of payments) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      if (enabled && p.online) announcePayment(p.amount);
    }
  }, [payments, enabled]);
}
