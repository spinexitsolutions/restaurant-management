import "server-only";
import QRCode from "qrcode";
import { appUrl } from "./utils";

export function tableMenuUrl(slug: string, qrToken: string) {
  return appUrl(`/m/${slug}?t=${qrToken}`);
}

export function qrDataUrl(text: string, width = 320) {
  return QRCode.toDataURL(text, { width, margin: 1, errorCorrectionLevel: "M" });
}
