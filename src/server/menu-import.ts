import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { MENU_COLUMNS, parseMenuSheet, formatVariants, type ImportRow, type ParseResult } from "@/lib/menu-import";

export type ImportMode = "add" | "update";

/**
 * Saves imported rows. Categories are matched by name (created when missing). Items are matched by
 * name inside their category: "add" skips existing ones, "update" overwrites price, type, GST,
 * description, availability and variants.
 */
export async function importMenuRows(restaurantId: string, rows: ImportRow[], mode: ImportMode) {
  return db.$transaction(
    async (tx) => {
      const counts = { created: 0, updated: 0, skipped: 0, categories: 0 };
      const categories = await tx.category.findMany({ where: { restaurantId } });
      const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
      let catOrder = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0);
      const items = await tx.menuItem.findMany({ where: { restaurantId }, select: { id: true, name: true, categoryId: true, sortOrder: true } });
      const itemKey = (categoryId: string, name: string) => `${categoryId}|${name.toLowerCase()}`;
      const itemByKey = new Map(items.map((i) => [itemKey(i.categoryId, i.name), i]));
      let itemOrder = items.reduce((m, i) => Math.max(m, i.sortOrder), 0);

      for (const row of rows) {
        let cat = catByName.get(row.category.toLowerCase());
        if (!cat) {
          cat = await tx.category.create({ data: { restaurantId, name: row.category, sortOrder: ++catOrder } });
          catByName.set(row.category.toLowerCase(), cat);
          counts.categories++;
        }
        const data = {
          price: row.price,
          foodType: row.foodType,
          gstRate: row.gstRate,
          description: row.description,
          isAvailable: row.isAvailable,
          isBestseller: row.isBestseller,
        };
        const variants = row.variants.map((v, i) => ({ name: v.name, price: v.price, sortOrder: i }));
        const existing = itemByKey.get(itemKey(cat.id, row.name));
        if (existing) {
          if (mode === "add") {
            counts.skipped++;
            continue;
          }
          await tx.menuItem.update({ where: { id: existing.id }, data });
          if (variants.length) {
            await tx.itemVariant.deleteMany({ where: { menuItemId: existing.id } });
            await tx.itemVariant.createMany({ data: variants.map((v) => ({ ...v, menuItemId: existing.id })) });
          }
          counts.updated++;
        } else {
          const created = await tx.menuItem.create({
            data: { restaurantId, categoryId: cat.id, name: row.name, sortOrder: ++itemOrder, ...data, variants: { create: variants } },
          });
          itemByKey.set(itemKey(cat.id, row.name), { id: created.id, name: created.name, categoryId: cat.id, sortOrder: created.sortOrder });
          counts.created++;
        }
      }
      return counts;
    },
    { timeout: 60_000 },
  );
}

/** Current menu in the import format (for export and "edit in Excel, import back"). */
export async function menuAsRows(restaurantId: string): Promise<ImportRow[]> {
  const items = await db.menuItem.findMany({
    where: { restaurantId },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: { category: { select: { name: true } }, variants: { orderBy: { sortOrder: "asc" } } },
  });
  return items.map((i) => ({
    category: i.category.name,
    name: i.name,
    price: Number(i.price),
    foodType: i.foodType,
    gstRate: i.gstRate === null ? null : Number(i.gstRate),
    description: i.description,
    variants: i.variants.map((v) => ({ name: v.name, price: Number(v.price) })),
    isAvailable: i.isAvailable,
    isBestseller: i.isBestseller,
  }));
}

const MENU_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", description: "Section heading the dish is listed under, e.g. Starters" },
          name: { type: "string" },
          price: { type: "number", description: "Price in rupees. If the dish has sizes, the smallest size's price." },
          foodType: { type: "string", enum: ["VEG", "NON_VEG", "EGG"] },
          description: { type: "string", description: "Short description printed on the menu, or empty" },
          variants: {
            type: "array",
            description: "Sizes/portions with their own price (Half/Full, Small/Large). Empty when there is one price.",
            items: {
              type: "object",
              properties: { name: { type: "string" }, price: { type: "number" } },
              required: ["name", "price"],
              additionalProperties: false,
            },
          },
        },
        required: ["category", "name", "price", "foodType", "description", "variants"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

type AiItem = { category: string; name: string; price: number; foodType: "VEG" | "NON_VEG" | "EGG"; description: string; variants: { name: string; price: number }[] };

export function aiImportEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Reads printed/handwritten menu photos with Claude and returns rows in the import format for review. */
export async function readMenuPhotos(images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[]): Promise<ParseResult> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // Re-runs on another model if this one declines, so the owner still gets their menu.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: MENU_SCHEMA } },
    system:
      "You copy restaurant menus from photos into structured data for an Indian restaurant POS. " +
      "List every dish exactly once with its section, name and price in rupees. Keep dish names as printed (fix obvious OCR-style typos only). " +
      "Use the green/red dot symbols, words like chicken/mutton/fish/prawn/egg, or the section name to decide VEG, NON_VEG or EGG; default to VEG when unclear. " +
      "When a dish has several prices (Half/Full, Regular/Large, Qtr/Half/Full), put them in variants and the smallest in price. " +
      "Do not invent dishes, prices or descriptions; skip anything you cannot read.",
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
          { type: "text" as const, text: `These ${images.length} photo(s) are pages of one menu. Extract all dishes.` },
        ],
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: { items: AiItem[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], errors: [{ line: 0, message: response.stop_reason === "max_tokens" ? "The menu is too long for one go. Try fewer photos at a time." : "Couldn't read the menu. Try clearer photos." }] };
  }
  // Same validation as a spreadsheet, so AI output gets the same checks and preview.
  return parseMenuSheet([
    [...MENU_COLUMNS],
    ...parsed.items.map((i) => [i.category, i.name, i.price, i.foodType === "NON_VEG" ? "Non-veg" : i.foodType === "EGG" ? "Egg" : "Veg", "", i.description, formatVariants(i.variants), "Yes", "No"]),
  ]);
}
