import { describe, expect, it } from "vitest";
import { templatePayload, toWaNumber } from "./whatsapp";

describe("whatsapp", () => {
  it("normalises Indian mobile numbers", () => {
    expect(toWaNumber("98765 43210")).toBe("919876543210");
    expect(toWaNumber("+91 9876543210")).toBe("919876543210");
    expect(toWaNumber("12345")).toBeNull();
  });
  it("builds a template message with body parameters", () => {
    expect(templatePayload("919876543210", "bill_ready", "en", ["Asha", "Sharma  Dhaba\nAndheri"])).toEqual({
      messaging_product: "whatsapp",
      to: "919876543210",
      type: "template",
      template: {
        name: "bill_ready",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Asha" }, { type: "text", text: "Sharma Dhaba Andheri" }] }],
      },
    });
    expect(templatePayload("91", "hello_world", "en_US", []).template).toEqual({ name: "hello_world", language: { code: "en_US" } });
  });
});
