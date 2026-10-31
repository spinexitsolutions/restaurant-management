#!/usr/bin/env node
// DineFlow print agent: run this on a PC in the restaurant to print KOTs and bills on a
// network (LAN/Wi-Fi) thermal printer, or a USB printer exposed as a device/shared printer.
// Needs only Node.js 18+. No other installs.
//
//   DINEFLOW_URL=https://your-domain.com PRINTER_TOKEN=xxxx node agent.mjs
//
// Printer address comes from the printer's settings in DineFlow ("192.168.1.50:9100"),
// or set PRINTER=192.168.1.50:9100 / PRINTER=/dev/usb/lp0 / PRINTER=\\localhost\POS80 here.

import net from "node:net";
import { writeFile } from "node:fs/promises";

const URL_BASE = (process.env.DINEFLOW_URL || "").replace(/\/$/, "");
const TOKEN = process.env.PRINTER_TOKEN || "";
const POLL_MS = Number(process.env.POLL_MS || 2000);

if (!URL_BASE || !TOKEN) {
  console.error("Set DINEFLOW_URL and PRINTER_TOKEN (shown in DineFlow → Kitchen setup → Printers).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

function sendTcp(address, data) {
  const [host, port = "9100"] = address.split(":");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port), timeout: 10000 }, () => socket.end(data));
    socket.on("close", (hadError) => (hadError ? null : resolve()));
    socket.on("timeout", () => socket.destroy(new Error(`Printer ${address} timed out`)));
    socket.on("error", reject);
  });
}

async function print(address, data) {
  // A path (Linux /dev/usb/lp0, Windows shared printer \\host\name) is written directly.
  if (address.startsWith("/") || address.startsWith("\\\\")) return writeFile(address, data);
  return sendTcp(address, data);
}

async function report(id, ok, error) {
  await fetch(`${URL_BASE}/api/print/agent/${id}`, { method: "POST", headers, body: JSON.stringify({ ok, error }) }).catch(() => {});
}

let warned = false;
async function tick() {
  try {
    const res = await fetch(`${URL_BASE}/api/print/agent`, { headers });
    if (res.status === 401) {
      console.error("Printer token rejected. Check PRINTER_TOKEN, or whether the printer was deleted.");
      return;
    }
    const { printer, jobs } = await res.json();
    const address = process.env.PRINTER || printer.address;
    if (!address) {
      if (!warned) console.error(`No address for printer "${printer.name}". Set it in DineFlow or with PRINTER=ip:9100.`);
      warned = true;
      return;
    }
    for (const job of jobs) {
      try {
        await print(address, Buffer.from(job.escpos, "base64"));
        await report(job.id, true);
        console.log(new Date().toLocaleTimeString(), "printed", job.title);
      } catch (e) {
        await report(job.id, false, String(e.message || e));
        console.error(new Date().toLocaleTimeString(), "failed", job.title, "-", e.message || e);
      }
    }
  } catch (e) {
    console.error("Can't reach DineFlow:", e.message || e);
  }
}

console.log(`DineFlow print agent started. Polling ${URL_BASE} every ${POLL_MS / 1000}s. Press Ctrl+C to stop.`);
for (;;) {
  await tick();
  await new Promise((r) => setTimeout(r, POLL_MS));
}
