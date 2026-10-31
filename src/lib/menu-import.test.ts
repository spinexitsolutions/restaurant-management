import { describe, expect, it } from "vitest";
import { menuToRows, parseCsv, parseMenuSheet, parseVariants, SAMPLE_MENU } from "./menu-import";
import { toCsv } from "./reports";

describe("menu import", () => {
  it("round-trips the export format", () => {
    const csv = toCsv(menuToRows(SAMPLE_MENU));
    const back = parseMenuSheet(parseCsv("﻿" + csv));
    expect(back.errors).toEqual([]);
    expect(back.rows).toEqual(SAMPLE_MENU);
  });

  it("reads loose real-world sheets: aliases, ₹ prices, merged categories, section rows", () => {
    const res = parseMenuSheet([
      ["My Restaurant Menu"],
      ["Section", "Dish", "Rate", "Type", "GST"],
      ["Soups", "", "", "", ""],
      ["", "Tomato Soup", "₹ 1,20", "veg", ""],
      ["", "Chicken Soup", "140", "NV", "5%"],
      ["Rice", "Egg Fried Rice", 160, "egg", 5],
      [null, null, null, null, null],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.rows.map((r) => [r.category, r.name, r.price, r.foodType, r.gstRate])).toEqual([
      ["Soups", "Tomato Soup", 120, "VEG", null],
      ["Soups", "Chicken Soup", 140, "NON_VEG", 5],
      ["Rice", "Egg Fried Rice", 160, "EGG", 5],
    ]);
  });

  it("reports bad lines with their line numbers", () => {
    const res = parseMenuSheet([
      ["Category", "Item", "Price", "Veg/Non-veg", "GST %", "Variants"],
      ["Mains", "Thali", "abc", "Veg", "", ""],
      ["Mains", "Biryani", "200", "Spicy", "", ""],
      ["Mains", "Pulao", "150", "Veg", "7", ""],
      ["Mains", "Dosa", "", "Veg", "", "Plain 80"],
      ["Mains", "Idli", "", "Veg", "", "Small: 40 | Large: 60"],
      ["Mains", "idli", "50", "Veg", "", ""],
    ]);
    expect(res.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 7]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ name: "Idli", price: 40, variants: [{ name: "Small", price: 40 }, { name: "Large", price: 60 }] });
  });

  it("parses quoted CSV and variant strings", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
    expect(parseVariants("Half=120, Full = ₹220")).toEqual([
      { name: "Half", price: 120 },
      { name: "Full", price: 220 },
    ]);
    expect(parseVariants("Half")).toBeNull();
  });
});
