"use client";

// Offline outbox: KOTs and payments made while the internet is down are kept on this device
// and replayed when it comes back. Each operation carries a clientRequestId so a retry after a
// half-finished request never creates a duplicate on the server.

export type OutboxOp =
  | { id: string; kind: "sendKot"; label: string; createdAt: number; payload: Record<string, unknown> }
  | { id: string; kind: "payment"; label: string; createdAt: number; orderId: string; payload: Record<string, unknown> };

const KEY = "outbox:v1";
const EVENT = "outbox-change";

export function readOutbox(): OutboxOp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(ops: OutboxOp[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function enqueue(op: OutboxOp) {
  write([...readOutbox(), op]);
}

export function onOutboxChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Replays queued operations in order. Stops at the first network failure (still offline).
 * Operations the server rejects (e.g. item sold out) are dropped and reported.
 */
export async function flushOutbox(run: (op: OutboxOp) => Promise<Result>): Promise<{ sent: number; failed: { label: string; error: string }[] }> {
  const failed: { label: string; error: string }[] = [];
  let sent = 0;
  for (const op of readOutbox()) {
    let res: Result;
    try {
      res = await run(op);
    } catch {
      break;
    }
    if (res.ok) sent++;
    else failed.push({ label: op.label, error: res.error });
    write(readOutbox().filter((o) => o.id !== op.id));
  }
  return { sent, failed };
}

export function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
