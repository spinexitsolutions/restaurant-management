import { describe, expect, it } from "vitest";
import { en } from "./en";
import { DICTIONARIES, translate } from ".";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("staff app translations", () => {
  it("every language has the same keys and placeholders as English", () => {
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      expect(Object.keys(dict).sort(), lang).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dict[key]), `${lang} ${key}`).toEqual(placeholders(en[key]));
        expect(dict[key].trim(), `${lang} ${key}`).not.toBe("");
      }
    }
  });

  it("fills placeholders and falls back to English", () => {
    expect(translate("hi", "floor.table", { name: "T4" })).toBe("टेबल T4");
    expect(translate("xx", "floor.table", { name: "T4" })).toBe("Table T4");
    expect(translate(null, "kitchen.active", { count: 3 })).toBe("3 active");
  });
});
