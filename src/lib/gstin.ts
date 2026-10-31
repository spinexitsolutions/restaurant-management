// GSTIN validation: format, state code and the mod-36 check character (15th character).

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Returns an error message for an invalid GSTIN, or null if it is valid. */
export function gstinError(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!FORMAT.test(g)) return "GSTIN must be 15 characters, like 27ABCDE1234F1Z0";
  if (!GST_STATES[g.slice(0, 2)]) return "GSTIN starts with an unknown state code";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "GSTIN check digit doesn't match. Please re-check for a typo.";
  return null;
}

export function gstinState(g: string): string | null {
  return GST_STATES[g.slice(0, 2)] ?? null;
}
