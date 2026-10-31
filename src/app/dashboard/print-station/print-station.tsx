"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, CheckCircle2, Monitor, Printer, Usb, XCircle } from "lucide-react";
import { Button, Card, Select } from "@/components/ui";
import { columnsFor, renderText, toEscPos, type ReceiptDoc } from "@/lib/escpos";
import { pickBluetooth, pickUsb, printViaSystem, reconnectUsb, supports, type Sink } from "@/lib/client/printers";
import { cn } from "@/lib/utils";

type Method = "system" | "usb" | "bluetooth";
type Job = { id: string; kind: string; title: string; document: ReceiptDoc; createdAt: string };

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function PrintStation({ printers, initial }: { printers: { id: string; name: string; paperWidth: number }[]; initial: string }) {
  const [printerId, setPrinterId] = useState(initial);
  const printer = printers.find((p) => p.id === printerId)!;
  const cols = columnsFor(printer.paperWidth);
  const [method, setMethod] = useState<Method>("system");
  const [sink, setSink] = useState<Sink | null>(null);
  const [running, setRunning] = useState(true);
  const [log, setLog] = useState<{ at: string; title: string; ok: boolean; error?: string }[]>([]);
  const [preview, setPreview] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const can = typeof navigator !== "undefined" ? supports() : { usb: false, bluetooth: false };

  useEffect(() => {
    const saved = store.get(`print-method:${printerId}`) as Method | null;
    setMethod(saved ?? "system");
    setSink(null);
    if (saved === "usb") reconnectUsb().then((s) => s && setSink(s)).catch(() => {});
  }, [printerId]);

  const choose = (m: Method) => {
    setMethod(m);
    setSink(null);
    store.set(`print-method:${printerId}`, m);
  };

  async function connect() {
    setError(null);
    try {
      setSink(method === "usb" ? await pickUsb() : await pickBluetooth());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect");
    }
  }

  const ready = method === "system" || !!sink;

  const tick = useCallback(async () => {
    if (busy.current || !running || !ready) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/print/jobs?printer=${printerId}`, { cache: "no-store" });
      if (!res.ok) return;
      const { jobs } = (await res.json()) as { jobs: Job[] };
      for (const job of jobs) {
        setPreview(job);
        let ok = true;
        let err: string | undefined;
        try {
          if (method === "system") await printViaSystem(job.document, cols, printer.paperWidth);
          else await sink!.write(toEscPos(job.document, cols));
        } catch (e) {
          ok = false;
          err = e instanceof Error ? e.message : "Print failed";
        }
        await fetch(`/api/print/jobs/${job.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok, error: err }) });
        setLog((l) => [{ at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), title: job.title, ok, error: err }, ...l].slice(0, 30));
        if (!ok && method !== "system") setSink(null);
      }
    } catch {
      // Offline for a moment; the queue waits on the server.
    } finally {
      busy.current = false;
    }
  }, [printerId, running, ready, method, sink, cols, printer.paperWidth]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [tick]);

  const methods: { key: Method; label: string; icon: typeof Monitor; available: boolean }[] = [
    { key: "system", label: "Installed printer", icon: Monitor, available: true },
    { key: "usb", label: "USB", icon: Usb, available: can.usb },
    { key: "bluetooth", label: "Bluetooth", icon: Bluetooth, available: can.bluetooth },
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Printer size={20} className="text-brand-600" />
          <div className="w-56">
            <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)} aria-label="Printer">
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.paperWidth}mm)
                </option>
              ))}
            </Select>
          </div>
          <span className={cn("ml-auto rounded-full px-3 py-1 text-sm font-medium", running && ready ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600")}>
            {running && ready ? "● Printing automatically" : running ? "Connect the printer" : "Paused"}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setRunning(!running)}>
            {running ? "Pause" : "Resume"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => (
            <button
              key={m.key}
              disabled={!m.available}
              onClick={() => choose(m.key)}
              className={cn("flex flex-col items-center gap-1 rounded-lg p-3 text-sm ring-1 disabled:opacity-40", method === m.key ? "bg-brand-50 text-brand-800 ring-brand-500" : "ring-stone-200")}
            >
              <m.icon size={20} />
              {m.label}
              {!m.available && <span className="text-[11px]">Not in this browser</span>}
            </button>
          ))}
        </div>

        {method === "system" ? (
          <p className="text-sm text-stone-600">
            Uses the printer installed on this computer. For printing <strong>without the print dialog</strong>, set the thermal printer as the default printer and open
            Chrome with <code className="rounded bg-stone-100 px-1">--kiosk-printing</code> (add it to the Chrome shortcut&apos;s target).
          </p>
        ) : sink ? (
          <p className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={16} /> Connected to {sink.label}
          </p>
        ) : (
          <div className="space-y-2">
            <Button onClick={connect}>{method === "usb" ? "Choose USB printer" : "Choose Bluetooth printer"}</Button>
            <p className="text-xs text-stone-500">
              {method === "usb"
                ? "On Windows, a printer whose driver is installed can't be opened over USB from the browser: use “Installed printer” for it instead."
                : "Works with BLE thermal printers. Bluetooth needs to be reconnected with one tap after the page reloads."}
            </p>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Last printed</h2>
          {preview ? (
            <pre className="overflow-x-auto rounded bg-stone-50 p-3 font-mono text-[11px] leading-tight">
              {renderText(preview.document, cols).map((l, i) => (
                <div key={i} className={cn(l.bold && "font-bold", l.big && "text-sm font-bold")}>
                  {l.text || " "}
                </div>
              ))}
            </pre>
          ) : (
            <p className="text-sm text-stone-500">Waiting for the first ticket…</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Activity</h2>
          <ul className="space-y-1 text-sm">
            {log.length === 0 && <li className="text-stone-500">Nothing yet.</li>}
            {log.map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                {l.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />}
                <span>
                  <span className="text-stone-500">{l.at}</span> {l.title}
                  {l.error && <span className="block text-xs text-red-600">{l.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
