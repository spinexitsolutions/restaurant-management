// Menu spreadsheet format shared by import (CSV / Excel / AI photo) and export.
// Pure functions so the browser can preview rows before anything is saved.

export const MENU_COLUMNS = ["Category", "Item", "Price", "Veg/Non-veg", "GST %", "Description", "Variants", "Available", "Bestseller"] as const;

export type FoodType = "VEG" | "NON_VEG" | "EGG";

export interface ImportRow {
  category: string;
  name: string;
  price: number; // rupees
  foodType: FoodType;
  gstRate: number | null; // null = restaurant default
  description: string | null;
  variants: { name: string; price: number }[];
  isAvailable: boolean;
  isBestseller: boolean;
}

export interface ParseResult {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
}

export const ALLOWED_GST = [0, 5, 12, 18, 28];
export const MAX_IMPORT_ROWS = 1000;

const ALIASES: Record<keyof Omit<ImportRow, "variants"> | "variants", string[]> = {
  category: ["category", "section", "group", "menu section", "course"],
  name: ["item", "name", "item name", "dish", "dish name", "product"],
  price: ["price", "rate", "mrp", "amount", "selling price", "price (₹)", "price (rs)"],
  foodType: ["veg/non-veg", "veg/nonveg", "type", "food type", "veg", "veg / non-veg"],
  gstRate: ["gst %", "gst", "gst%", "tax", "tax %", "gst rate"],
  description: ["description", "details", "desc"],
  variants: ["variants", "sizes", "portions", "options"],
  isAvailable: ["available", "in stock", "active"],
  isBestseller: ["bestseller", "best seller", "popular"],
};

const clean = (v: unknown) =>
  (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v)).replace(/\s+/g, " ").trim();

export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  const s = clean(v).replace(/[₹,\s]|rs\.?|inr/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseFoodType(v: unknown): FoodType | null {
  const s = clean(v).toLowerCase().replace(/[\s_-]/g, "");
  if (!s || ["veg", "v", "pureveg", "vegetarian", "green", "शाकाहारी"].includes(s)) return "VEG";
  if (["nonveg", "nv", "n", "nonvegetarian", "red", "chicken", "mutton", "fish", "मांसाहारी"].includes(s)) return "NON_VEG";
  if (["egg", "e", "eggetarian", "अंडा"].includes(s)) return "EGG";
  return null;
}

function parseBool(v: unknown, fallback: boolean) {
  const s = clean(v).toLowerCase();
  if (!s) return fallback;
  if (["yes", "y", "true", "1", "haan", "ha"].includes(s)) return true;
  if (["no", "n", "false", "0", "nahi"].includes(s)) return false;
  return fallback;
}

/** "Half: 120 | Full: 220" (also "Half=120, Full=220"). */
export function parseVariants(v: unknown): { name: string; price: number }[] | null {
  const s = clean(v);
  if (!s) return [];
  const out: { name: string; price: number }[] = [];
  for (const part of s.split(/[|;,\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.+?)\s*[:=-]\s*₹?\s*([\d.,]+)\s*$/);
    if (!m) return null;
    const price = parseMoney(m[2]);
    if (price === null) return null;
    out.push({ name: m[1].trim().slice(0, 40), price });
  }
  return out;
}

export function formatVariants(variants: { name: string; price: number }[]) {
  return variants.map((v) => `${v.name}: ${v.price}`).join(" | ");
}

/** Finds the header row (first row naming at least an item and a price column) and maps columns. */
function headerMap(rows: unknown[][]) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r].map((c) => clean(c).toLowerCase());
    const map: Partial<Record<keyof typeof ALIASES, number>> = {};
    for (const [field, names] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
      const idx = cells.findIndex((c) => names.includes(c));
      if (idx >= 0) map[field] = idx;
    }
    if (map.name !== undefined && (map.price !== undefined || map.variants !== undefined)) return { row: r, map };
  }
  return null;
}

/** Turns spreadsheet rows (first row = headers) into menu rows, collecting a message per bad line. */
export function parseMenuSheet(rows: unknown[][]): ParseResult {
  const errors: ParseResult["errors"] = [];
  const header = headerMap(rows);
  if (!header) return { rows: [], errors: [{ line: 1, message: `Couldn't find the header row. Use the template columns: ${MENU_COLUMNS.join(", ")}` }] };
  const { map } = header;
  const get = (row: unknown[], f: keyof typeof ALIASES) => (map[f] === undefined ? "" : row[map[f]!]);

  const out: ImportRow[] = [];
  const seen = new Set<string>();
  let category = "";
  for (let r = header.row + 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    if (!row || row.every((c) => clean(c) === "")) continue;
    if (out.length >= MAX_IMPORT_ROWS) {
      errors.push({ line, message: `Only ${MAX_IMPORT_ROWS} items can be imported at once` });
      break;
    }
    const name = clean(get(row, "name")).slice(0, 80);
    const cat = clean(get(row, "category")).slice(0, 60);
    if (cat) category = cat; // blank category = same as the row above (merged cells)
    if (!name) {
      // A row with only a category acts as a section heading.
      if (cat) continue;
      errors.push({ line, message: "Item name is missing" });
      continue;
    }
    if (!category) {
      errors.push({ line, message: `${name}: category is missing` });
      continue;
    }
    const variants = parseVariants(get(row, "variants"));
    if (variants === null) {
      errors.push({ line, message: `${name}: write variants like "Half: 120 | Full: 220"` });
      continue;
    }
    let price = parseMoney(get(row, "price"));
    if (price === null && variants.length) price = Math.min(...variants.map((v) => v.price));
    if (price === null) {
      errors.push({ line, message: `${name}: price is missing or not a number` });
      continue;
    }
    const foodType = parseFoodType(get(row, "foodType"));
    if (!foodType) {
      errors.push({ line, message: `${name}: Veg/Non-veg should be Veg, Non-veg or Egg` });
      continue;
    }
    const gstRaw = clean(get(row, "gstRate")).replace("%", "");
    const gstRate = gstRaw === "" ? null : Number(gstRaw);
    if (gstRate !== null && !ALLOWED_GST.includes(gstRate)) {
      errors.push({ line, message: `${name}: GST must be one of ${ALLOWED_GST.join(", ")}` });
      continue;
    }
    const key = `${category.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ line, message: `${name} appears twice in ${category}` });
      continue;
    }
    seen.add(key);
    out.push({
      category,
      name,
      price,
      foodType,
      gstRate,
      description: clean(get(row, "description")).slice(0, 300) || null,
      variants,
      isAvailable: parseBool(get(row, "isAvailable"), true),
      isBestseller: parseBool(get(row, "isBestseller"), false),
    });
  }
  return { rows: out, errors };
}

/** Minimal RFC 4180 CSV reader (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** Rows for the export/template file, in MENU_COLUMNS order. */
export function menuToRows(items: ImportRow[]): (string | number)[][] {
  return [
    [...MENU_COLUMNS],
    ...items.map((i) => [
      i.category,
      i.name,
      i.price,
      i.foodType === "NON_VEG" ? "Non-veg" : i.foodType === "EGG" ? "Egg" : "Veg",
      i.gstRate ?? "",
      i.description ?? "",
      formatVariants(i.variants),
      yesNo(i.isAvailable),
      yesNo(i.isBestseller),
    ]),
  ];
}

export const SAMPLE_MENU: ImportRow[] = [
  { category: "Starters", name: "Paneer Tikka", price: 260, foodType: "VEG", gstRate: null, description: "Char-grilled cottage cheese", variants: [], isAvailable: true, isBestseller: true },
  { category: "Starters", name: "Chicken 65", price: 280, foodType: "NON_VEG", gstRate: null, description: null, variants: [], isAvailable: true, isBestseller: false },
  { category: "Main Course", name: "Dal Makhani", price: 180, foodType: "VEG", gstRate: null, description: null, variants: [{ name: "Half", price: 180 }, { name: "Full", price: 300 }], isAvailable: true, isBestseller: false },
  { category: "Breads", name: "Butter Naan", price: 50, foodType: "VEG", gstRate: null, description: null, variants: [], isAvailable: true, isBestseller: false },
];
