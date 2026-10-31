import { describe, expect, it } from "vitest";
import { gstinCheckChar, gstinError, gstinState } from "./gstin";

describe("gstin", () => {
  const body = "27AAPFU0939F1Z";
  const valid = body + gstinCheckChar(body);

  it("accepts a GSTIN with the right check character", () => {
    expect(valid).toBe("27AAPFU0939F1ZV");
    expect(gstinError(valid)).toBeNull();
    expect(gstinError(valid.toLowerCase())).toBeNull();
    expect(gstinState(valid)).toBe("Maharashtra");
  });
  it("catches single-character typos", () => {
    const typo = "27AAPFU0939F1ZV".replace("0939", "0989");
    expect(gstinError(typo)).toMatch(/check digit/);
  });
  it("rejects bad format and state codes", () => {
    expect(gstinError("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(gstinError("99AAPFU0939F1Z" + gstinCheckChar("99AAPFU0939F1Z"))).toMatch(/state code/);
  });
});
