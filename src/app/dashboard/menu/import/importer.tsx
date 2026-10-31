"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Download, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { Badge, Button, Card, FoodTypeIcon, Select } from "@/components/ui";
import { parseCsv, parseMenuSheet, type ImportRow, type ParseResult } from "@/lib/menu-import";
import { importMenu, readMenuFromPhotos } from "./actions";

const EXPORT = "/api/export";

/** Shrinks a photo to at most 1600px and returns base64 JPEG (keeps uploads small and fast). */
async function photoToJpeg(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg" as const, data: url.slice(url.indexOf(",") + 1) };
}

async function readSheet(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown[][]; // first sheet
  }
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported. In Excel use File → Save As → .xlsx or CSV.");
  return parseCsv(await file.text());
}

export function MenuImporter({ aiEnabled }: { aiEnabled: boolean }) {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<"add" | "update">("add");
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const sheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  function onSheet(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    start(async () => {
      try {
        setResult(parseMenuSheet(await readSheet(file)));
        setSource(file.name);
      } catch (e) {
        setMessage({ error: e instanceof Error ? e.message : "Couldn't read this file" });
      }
    });
  }

  function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    start(async () => {
      const images = await Promise.all([...files].slice(0, 5).map(photoToJpeg));
      const res = await readMenuFromPhotos(images);
      if (!res.ok) return setMessage({ error: res.error });
      setResult(res.result);
      setSource(`${files.length} photo${files.length > 1 ? "s" : ""}`);
      if (!res.result.rows.length && !res.result.errors.length) setMessage({ error: "No dishes found in the photos." });
    });
  }

  function remove(i: number) {
    setResult((r) => r && { ...r, rows: r.rows.filter((_, j) => j !== i) });
  }

  function save() {
    if (!result) return;
    start(async () => {
      const res = await importMenu(result.rows, mode);
      if (!res.ok) return setMessage({ error: res.error });
      const c = res.counts;
      setMessage({ ok: `Done: ${c.created} new item(s), ${c.updated} updated, ${c.skipped} already there, ${c.categories} new categor${c.categories === 1 ? "y" : "ies"}.` });
      setResult(null);
    });
  }

  const categories = result ? [...new Set(result.rows.map((r) => r.category))] : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet size={18} /> Excel or CSV
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Columns: Category, Item, Price, Veg/Non-veg, GST %, Description, Variants (like <code>Half: 120 | Full: 220</code>), Available, Bestseller. Only Category, Item and Price are required.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => sheetInput.current?.click()}>
              Choose file
            </Button>
            <a href={`${EXPORT}/menu-template`} download className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
              <Download size={16} /> Template
            </a>
            <a href={`${EXPORT}/menu`} download className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
              <Download size={16} /> Current menu
            </a>
          </div>
          <input
            ref={sheetInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              onSheet(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-semibold">
            <Camera size={18} /> Photo of the menu <Badge tone="brand">AI</Badge>
          </h2>
          <p className="mt-1 text-sm text-stone-600">Take clear photos of each page (up to 5). AI reads dishes, prices, sizes and veg/non-veg. You review before saving.</p>
          <div className="mt-4">
            <Button disabled={pending || !aiEnabled} onClick={() => photoInput.current?.click()}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Add photos
            </Button>
            {!aiEnabled && <p className="mt-2 text-xs text-stone-500">Needs ANTHROPIC_API_KEY on the server.</p>}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </Card>
      </div>

      {pending && !result && <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" /> Reading…</p>}
      {message?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message.ok}</p>}
      {message?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message.error}</p>}

      {result && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-3">
            <p className="flex-1 text-sm">
              <b>{result.rows.length}</b> item(s) in {categories.length} categor{categories.length === 1 ? "y" : "ies"} from {source}
              {result.errors.length > 0 && <span className="text-red-700"> · {result.errors.length} line(s) skipped</span>}
            </p>
            <Select className="w-auto" value={mode} onChange={(e) => setMode(e.target.value as "add" | "update")}>
              <option value="add">Only add new items</option>
              <option value="update">Add new + update existing (same name)</option>
            </Select>
            <Button disabled={pending || !result.rows.length} onClick={save}>
              Import {result.rows.length} item(s)
            </Button>
          </div>
          {result.errors.length > 0 && (
            <ul className="space-y-0.5 border-b border-stone-200 bg-red-50 px-5 py-3 text-sm text-red-800">
              {result.errors.slice(0, 50).map((e, i) => (
                <li key={i}>
                  {e.line > 0 && `Line ${e.line}: `}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2">Variants</th>
                  <th className="px-4 py-2">GST</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.rows.map((r: ImportRow, i) => (
                  <tr key={`${r.category}-${r.name}`} className={r.isAvailable ? "" : "text-stone-400"}>
                    <td className="px-4 py-2 text-stone-500">{r.category}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <FoodTypeIcon type={r.foodType} /> {r.name}
                        {r.isBestseller && <Badge tone="amber">Bestseller</Badge>}
                      </span>
                      {r.description && <span className="block text-xs text-stone-500">{r.description}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">₹{r.price}</td>
                    <td className="px-4 py-2 text-xs text-stone-600">{r.variants.map((v) => `${v.name} ₹${v.price}`).join(", ")}</td>
                    <td className="px-4 py-2 text-xs">{r.gstRate === null ? "Default" : `${r.gstRate}%`}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => remove(i)} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${r.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
