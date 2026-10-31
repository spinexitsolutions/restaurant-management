import { describe, expect, it } from "vitest";
import { tokenState, type TokenItem } from "./tokens";

const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 12, m));
const item = (status: TokenItem["status"], m = 0, held = false): TokenItem => ({ status, held, updatedAt: at(m) });

describe("token pickup state", () => {
  it("is preparing while anything cooks or is held", () => {
    expect(tokenState([item("READY"), item("PREPARING")]).state).toBe("PREPARING");
    expect(tokenState([item("READY"), item("NEW", 0, true)]).state).toBe("PREPARING");
  });
  it("is ready when everything is ready, from the last item's time", () => {
    expect(tokenState([item("READY", 3), item("READY", 7), item("CANCELLED")])).toEqual({ state: "READY", readyAt: at(7) });
    expect(tokenState([item("SERVED"), item("READY", 5)]).state).toBe("READY");
  });
  it("is collected when served, or when nothing is live", () => {
    expect(tokenState([item("SERVED"), item("SERVED")]).state).toBe("COLLECTED");
    expect(tokenState([item("CANCELLED")]).state).toBe("COLLECTED");
    expect(tokenState([]).state).toBe("COLLECTED");
  });
});
