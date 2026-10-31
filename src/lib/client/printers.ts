"use client";

// Browser printing back-ends for the print station: the system print dialog (silent with Chrome's
// --kiosk-printing flag), WebUSB and Web Bluetooth (BLE) thermal printers.

import { renderText, type ReceiptDoc } from "@/lib/escpos";

// Minimal typings for WebUSB / Web Bluetooth (not in TypeScript's DOM lib).
interface UsbEndpoint {
  direction: "in" | "out";
  type: string;
  endpointNumber: number;
}
interface UsbDevice {
  productName?: string;
  opened: boolean;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: UsbEndpoint[] } }[] } | null;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<unknown>;
}
interface BtCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: BufferSource): Promise<void>;
  writeValueWithoutResponse?(d: BufferSource): Promise<void>;
}
interface BtDevice {
  name?: string;
  gatt?: { connected: boolean; connect(): Promise<{ getPrimaryServices(): Promise<{ getCharacteristics(): Promise<BtCharacteristic[]> }[]> }> };
}

const nav = () =>
  navigator as unknown as {
    usb?: { requestDevice(o: { filters: object[] }): Promise<UsbDevice>; getDevices(): Promise<UsbDevice[]> };
    bluetooth?: { requestDevice(o: object): Promise<BtDevice> };
  };

export const supports = () => ({ usb: !!nav().usb, bluetooth: !!nav().bluetooth });

export interface Sink {
  label: string;
  write(bytes: Uint8Array): Promise<void>;
}

async function usbSink(device: UsbDevice): Promise<Sink> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const iface = device.configuration!.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
  if (!iface) throw new Error("This USB device has no printer output");
  // Already claimed when reconnecting in the same session; that's fine.
  await device.claimInterface(iface.interfaceNumber).catch(() => {});
  const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!.endpointNumber;
  return { label: device.productName ?? "USB printer", write: async (bytes) => void (await device.transferOut(ep, bytes as BufferSource)) };
}

/** Asks the user to pick a USB printer (needs a click). */
export async function pickUsb() {
  const usb = nav().usb;
  if (!usb) throw new Error("This browser doesn't support USB printers. Use Chrome or Edge.");
  return usbSink(await usb.requestDevice({ filters: [] }));
}

/** Reconnects to a USB printer allowed earlier, without a click. */
export async function reconnectUsb() {
  const devices = (await nav().usb?.getDevices()) ?? [];
  return devices[0] ? usbSink(devices[0]) : null;
}

// Service UUIDs used by common BLE thermal printers.
const BLE_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb"];

/** Asks the user to pick a Bluetooth (BLE) printer. Classic-only Bluetooth printers can't be reached from a browser. */
export async function pickBluetooth(): Promise<Sink> {
  const bt = nav().bluetooth;
  if (!bt) throw new Error("This browser doesn't support Bluetooth. Use Chrome on Android, Windows or Mac.");
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
  const server = await device.gatt!.connect();
  let target: BtCharacteristic | null = null;
  for (const service of await server.getPrimaryServices()) {
    for (const c of await service.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        target = c;
        break;
      }
    }
    if (target) break;
  }
  if (!target) throw new Error("Couldn't find the printer's data channel");
  const ch = target;
  return {
    label: device.name ?? "Bluetooth printer",
    async write(bytes) {
      // BLE packets are small: send in chunks with a short pause so cheap printers keep up.
      for (let i = 0; i < bytes.length; i += 100) {
        const chunk = bytes.slice(i, i + 100);
        if (ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(chunk);
        else await ch.writeValue(chunk);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Prints through the system print dialog in a hidden frame sized to the paper roll. */
export function printViaSystem(doc: ReceiptDoc, cols: number, paperWidth: number): Promise<void> {
  const lines = renderText(doc, cols)
    .map((l) => `<div class="${l.bold ? "b" : ""} ${l.big ? "big" : ""}">${escapeHtml(l.text) || "&nbsp;"}</div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${paperWidth}mm auto; margin: 0 }
    body { margin: 0; padding: 2mm; width: ${paperWidth - 4}mm; font: ${paperWidth <= 58 ? 10 : 11}px/1.25 ui-monospace, Menlo, Consolas, monospace; white-space: pre; color: #000 }
    .b { font-weight: 700 } .big { font-size: 1.6em; font-weight: 700 }
  </style></head><body>${lines}</body></html>`;
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    frame.srcdoc = html;
    frame.onload = () => {
      const w = frame.contentWindow!;
      const done = () => {
        setTimeout(() => frame.remove(), 500);
        resolve();
      };
      w.addEventListener("afterprint", done, { once: true });
      w.focus();
      w.print();
      // Some browsers don't fire afterprint; print() blocks until the dialog closes there.
      setTimeout(done, 1500);
    };
  });
}
