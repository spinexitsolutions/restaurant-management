// Receipt documents and ESC/POS rendering for thermal printers. Shared by the server (print agent jobs)
// and the browser print station (WebUSB / Bluetooth / system print).

export type ReceiptLine =
  | { t: "text"; text: string; align?: "left" | "center" | "right"; bold?: boolean; big?: boolean }
  | { t: "row"; left: string; right: string; bold?: boolean }
  | { t: "rule" }
  | { t: "feed"; n?: number };

export interface ReceiptDoc {
  lines: ReceiptLine[];
}

/** Characters per line in the printer's normal font. */
export const columnsFor = (paperWidth: number) => (paperWidth <= 58 ? 32 : 48);

/** Most thermal printers only have ASCII-ish code pages: map what we can, drop the rest. */
export function toAscii(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs ")
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\s*·\s*/g, " - ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "?");
}

export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > width) {
        if (line) out.push(line);
        for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
        line = out.pop() ?? "";
        if (line.length === width) {
          out.push(line);
          line = "";
        }
        continue;
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function pad(text: string, width: number, align: "left" | "center" | "right") {
  const free = Math.max(0, width - text.length);
  if (align === "right") return " ".repeat(free) + text;
  if (align === "center") return " ".repeat(Math.floor(free / 2)) + text;
  return text;
}

/** Left text with right-aligned amount; long left text wraps and the amount sits on its last line. */
export function row(left: string, right: string, width: number): string[] {
  const room = Math.max(1, width - right.length - 1);
  const lines = wrap(left, room);
  const last = lines.pop() ?? "";
  return [...lines, last + " ".repeat(Math.max(1, width - last.length - right.length)) + right];
}

/** Plain-text preview, one string per printed line (big text uses half the columns). */
export function renderText(doc: ReceiptDoc, cols: number): { text: string; bold: boolean; big: boolean }[] {
  const out: { text: string; bold: boolean; big: boolean }[] = [];
  for (const l of doc.lines) {
    if (l.t === "rule") out.push({ text: "-".repeat(cols), bold: false, big: false });
    else if (l.t === "feed") for (let i = 0; i < (l.n ?? 1); i++) out.push({ text: "", bold: false, big: false });
    else if (l.t === "row") for (const r of row(toAscii(l.left), toAscii(l.right), cols)) out.push({ text: r, bold: !!l.bold, big: false });
    else {
      const w = l.big ? Math.floor(cols / 2) : cols;
      for (const part of wrap(toAscii(l.text), w)) out.push({ text: pad(part, w, l.align ?? "left"), bold: !!l.bold, big: !!l.big });
    }
  }
  return out;
}

const ESC = 0x1b;
const GS = 0x1d;

/** ESC/POS bytes: initialise, print every line, feed and partial-cut. */
export function toEscPos(doc: ReceiptDoc, cols: number): Uint8Array {
  const bytes: number[] = [ESC, 0x40];
  for (const line of renderText(doc, cols)) {
    bytes.push(ESC, 0x45, line.bold ? 1 : 0);
    bytes.push(GS, 0x21, line.big ? 0x11 : 0x00);
    for (const ch of line.text) bytes.push(ch.charCodeAt(0));
    bytes.push(0x0a);
  }
  bytes.push(ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x64, 4, GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(bytes);
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
