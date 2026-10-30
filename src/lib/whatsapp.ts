// WhatsApp Cloud API payloads. Business-initiated messages must use templates approved in Meta Business Manager.

export const GRAPH_VERSION = "v21.0";

/** Indian 10-digit mobile -> E.164 without "+", as the Cloud API expects. */
export function toWaNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

export function templatePayload(to: string, template: string, lang: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      // Template variables can't contain newlines or long runs of spaces.
      ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").trim().slice(0, 1000) })) }] } : {}),
    },
  };
}
