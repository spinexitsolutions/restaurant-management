"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

/** Shrinks a photo in the browser (max side `maxSize`, WebP) so uploads are small and fast. */
async function resize(file: File, maxSize: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/webp", 0.82));
}

export function ImageUpload({
  value,
  onChange,
  maxSize = 800,
  name,
  label = "Upload photo",
}: {
  value: string;
  onChange?: (url: string) => void;
  maxSize?: number;
  name?: string; // when set, a hidden input carries the URL in a regular form
  label?: string;
}) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const update = (next: string) => {
    setUrl(next);
    onChange?.(next);
  };

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const blob = await resize(file, maxSize);
      const body = new FormData();
      body.append("file", new File([blob], "photo.webp", { type: "image/webp" }));
      const res = await fetch("/api/images", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      update(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      {name && <input type="hidden" name={name} value={url} />}
      <div className="flex items-center gap-3">
        {url ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone-200" />
            <button type="button" onClick={() => update("")} className="absolute -top-2 -right-2 rounded-full bg-white p-0.5 shadow ring-1 ring-stone-200" aria-label="Remove photo">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
            <ImagePlus size={24} />
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          {busy ? "Uploading..." : url ? "Change" : label}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
