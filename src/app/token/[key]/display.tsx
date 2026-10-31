"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Maximize, Volume2 } from "lucide-react";

/** Says "Token 42" out loud (Hindi voice if the TV has one) after a short chime. */
function announce(tokens: number[]) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
  if (!("speechSynthesis" in window)) return;
  const hindi = speechSynthesis.getVoices().find((v) => v.lang.startsWith("hi"));
  for (const t of tokens) {
    const u = new SpeechSynthesisUtterance(hindi ? `टोकन नंबर ${t}, आपका ऑर्डर तैयार है` : `Token number ${t}, your order is ready`);
    if (hindi) u.voice = hindi;
    u.lang = hindi ? "hi-IN" : "en-IN";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

export function TokenDisplay({
  name,
  logoUrl,
  color,
  enabled,
  preparing,
  ready,
}: {
  name: string;
  logoUrl: string | null;
  color: string;
  enabled: boolean;
  preparing: number[];
  ready: { token: number; label: string | null }[];
}) {
  const router = useRouter();
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<number[]>([]);
  const seen = useRef<Set<number> | null>(null);

  // Refresh every 3 seconds; the page is tiny.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const now = ready.map((r) => r.token);
    if (seen.current === null) {
      seen.current = new Set(now); // don't announce what was already ready when the screen opened
      return;
    }
    const added = now.filter((t) => !seen.current!.has(t));
    seen.current = new Set(now);
    if (!added.length) return;
    setFresh(added);
    if (sound) announce(added);
    const id = setTimeout(() => setFresh([]), 8000);
    return () => clearTimeout(id);
  }, [ready, sound]);

  return (
    <div className="flex min-h-dvh flex-col bg-stone-950 text-white" style={{ "--theme": color } as React.CSSProperties}>
      <header className="flex items-center gap-4 px-8 py-5" style={{ background: "var(--theme)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 rounded-lg bg-white object-cover" />}
        <h1 className="flex-1 text-3xl font-bold">{name}</h1>
        {!sound && (
          <button
            onClick={() => {
              setSound(true);
              announce([]);
              document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-lg font-semibold"
          >
            <Volume2 /> <Maximize size={18} /> Start display
          </button>
        )}
      </header>
      {!enabled ? (
        <p className="m-auto text-2xl text-stone-400">Token mode is off. Turn it on in Settings → Counter / QSR.</p>
      ) : (
        <main className="grid flex-1 grid-cols-1 md:grid-cols-[2fr_3fr]">
          <section className="border-r border-stone-800 p-8">
            <h2 className="mb-6 text-2xl font-semibold tracking-wide text-amber-400 uppercase">Preparing · बन रहा है</h2>
            <div className="flex flex-wrap gap-4">
              {preparing.length === 0 && <p className="text-xl text-stone-500">—</p>}
              {preparing.map((t) => (
                <span key={t} className="min-w-24 rounded-xl bg-stone-800 px-5 py-3 text-center text-5xl font-bold tabular-nums text-stone-200">
                  {t}
                </span>
              ))}
            </div>
          </section>
          <section className="p-8">
            <h2 className="mb-6 text-2xl font-semibold tracking-wide text-green-400 uppercase">Ready · तैयार है, ले जाइए</h2>
            <div className="flex flex-wrap gap-5">
              {ready.length === 0 && <p className="text-xl text-stone-500">—</p>}
              {ready.map((r) => (
                <div
                  key={r.token}
                  className={`min-w-36 rounded-2xl px-6 py-4 text-center ${fresh.includes(r.token) ? "animate-pulse bg-green-500 text-stone-950" : "bg-green-700"}`}
                >
                  <p className="text-7xl font-black tabular-nums">{r.token}</p>
                  {r.label && <p className="mt-1 truncate text-lg font-medium opacity-90">{r.label}</p>}
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
