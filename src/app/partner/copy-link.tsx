"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const share = `Restaurant ke liye QR menu, GST billing, kitchen aur waiter app — sab ek jagah. 14 din free try karein: ${link}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-full truncate rounded bg-stone-100 px-3 py-2 text-sm">{link}</code>
      <button onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm ring-1 ring-stone-300">
        <Copy size={14} /> {copied ? "Copied" : "Copy"}
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white">
        <MessageCircle size={14} /> Share on WhatsApp
      </a>
    </div>
  );
}
