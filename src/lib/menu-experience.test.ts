import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "./media";
import { equalShare, itemsShare, normaliseShare } from "./split";
import { buildSuggestions } from "./suggestions";

describe("split bill", () => {
  it("splits equally, rounded up to the rupee", () => {
    expect(equalShare(100000, 3)).toBe(33400);
    expect(equalShare(100, 4)).toBe(100);
    expect(equalShare(0, 3)).toBe(0);
  });
  it("charges a fair share of tax and discount for chosen items", () => {
    // Items worth ₹1000, bill ₹945 after discount + GST; someone ate ₹400 of it.
    expect(itemsShare(94500, 100000, 40000, 94500)).toBe(37800);
    expect(itemsShare(94500, 100000, 40000, 20000)).toBe(20000); // capped at what's due
  });
  it("rejects bad amounts and avoids leaving paise behind", () => {
    expect(normaliseShare(50, 10000)).toEqual({ error: "Enter at least ₹1" });
    expect(normaliseShare(20000, 10000)).toEqual({ error: "That's more than what's left to pay" });
    expect(normaliseShare(9950, 10000)).toEqual({ amount: 10000 });
    expect(normaliseShare(5000, 10000)).toEqual({ amount: 5000 });
  });
});

describe("dish videos", () => {
  it("accepts YouTube and direct video links over https only", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ type: "youtube", id: "dQw4w9WgXcQ" });
    expect(parseVideoUrl("https://cdn.example.com/paneer.mp4")).toEqual({ type: "file", url: "https://cdn.example.com/paneer.mp4" });
    expect(parseVideoUrl("http://cdn.example.com/paneer.mp4")).toBeNull();
    expect(parseVideoUrl("https://example.com/page")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("suggestions", () => {
  const items = [
    { id: "tikka", pairsWith: ["lassi"], available: true },
    { id: "naan", pairsWith: [], available: true },
    { id: "dal", pairsWith: [], available: true },
    { id: "lassi", pairsWith: [], available: true },
    { id: "soup", pairsWith: [], available: false },
  ];
  it("puts owner pairings first, then frequent combos, skipping sold-out dishes", () => {
    const s = buildSuggestions(items, [
      { a: "tikka", b: "naan", orders: 9 },
      { a: "dal", b: "tikka", orders: 4 },
      { a: "tikka", b: "soup", orders: 20 },
      { a: "naan", b: "dal", orders: 1 },
    ]);
    expect(s.get("tikka")).toEqual(["lassi", "naan", "dal"]);
    expect(s.get("naan")).toEqual(["tikka"]); // naan+dal seen only once
    expect(s.has("lassi")).toBe(false);
  });
});
