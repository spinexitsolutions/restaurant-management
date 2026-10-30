"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card, Select } from "@/components/ui";
import { getAiSummary } from "./actions";

export function AiSummary() {
  const [lang, setLang] = useState<"en" | "hinglish">("hinglish");
  const [result, setResult] = useState<{ text?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex flex-1 items-center gap-2 font-semibold">
          <Sparkles size={18} className="text-brand-600" /> AI summary
        </h2>
        <div className="w-32">
          <Select value={lang} onChange={(e) => setLang(e.target.value as "en" | "hinglish")} aria-label="Language">
            <option value="hinglish">Hinglish</option>
            <option value="en">English</option>
          </Select>
        </div>
        <Button disabled={pending} onClick={() => start(async () => setResult(await getAiSummary(lang).then((r) => (r.ok ? { text: r.text } : { error: r.error }))))}>
          {pending ? "Thinking..." : result?.text ? "Refresh" : "Write summary"}
        </Button>
      </div>
      {result?.text && <div className="mt-4 text-sm leading-relaxed whitespace-pre-line text-stone-800">{result.text}</div>}
      {result?.error && <p className="mt-3 text-sm text-red-600">{result.error}</p>}
      <p className="mt-3 text-xs text-stone-400">Written by Claude from your last 4 weeks of numbers. Check important figures in Reports.</p>
    </Card>
  );
}
