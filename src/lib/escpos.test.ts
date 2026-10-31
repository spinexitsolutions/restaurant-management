import { describe, expect, it } from "vitest";
import { renderText, row, toAscii, toEscPos, wrap } from "./escpos";

describe("escpos", () => {
  it("makes text printable on ASCII-only printers", () => {
    expect(toAscii("2 × Paneer – ₹260")).toBe("2 x Paneer - Rs 260");
    expect(toAscii("Tandoor · 12:30")).toBe("Tandoor - 12:30");
    expect(toAscii("पनीर")).toBe("????");
  });
  it("wraps words and splits words longer than the line", () => {
    expect(wrap("Butter Chicken with extra gravy", 12)).toEqual(["Butter", "Chicken with", "extra gravy"]);
    expect(wrap("ABCDEFGHIJKLMNO", 6)).toEqual(["ABCDEF", "GHIJKL", "MNO"]);
  });
  it("right-aligns amounts and wraps long item names", () => {
    expect(row("Paneer Tikka", "260.00", 32)).toEqual(["Paneer Tikka" + " ".repeat(14) + "260.00"]);
    const r = row("Dal Makhani (Full) with extra butter on top", "220.00", 32);
    expect(r.every((l) => l.length <= 32)).toBe(true);
    expect(r.at(-1)!.endsWith("220.00")).toBe(true);
  });
  it("centres and halves the width for big text", () => {
    const lines = renderText({ lines: [{ t: "text", text: "KOT 12", align: "center", big: true }, { t: "rule" }] }, 32);
    expect(lines[0]).toEqual({ text: "     KOT 12", bold: false, big: true });
    expect(lines[1].text).toBe("-".repeat(32));
  });
  it("produces ESC/POS with init, size/bold codes and a cut", () => {
    const bytes = toEscPos({ lines: [{ t: "text", text: "Hi", bold: true }] }, 32);
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.slice(2, 5)]).toEqual([0x1b, 0x45, 1]);
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(String.fromCharCode(...bytes.slice(8, 10))).toBe("Hi");
  });
});
