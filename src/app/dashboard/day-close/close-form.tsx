"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatINR } from "@/lib/gst";
import { closeDay } from "./actions";

export function CloseDayForm({ date, cashSales, suggestedOpening }: { date: string; cashSales: number; suggestedOpening: number }) {
  const [state, action] = useActionState(closeDay, null);
  const [opening, setOpening] = useState((suggestedOpening / 100).toFixed(2));
  const [counted, setCounted] = useState("");
  const expected = Math.round(Number(opening || 0) * 100) + cashSales;
  const diff = counted === "" ? null : Math.round(Number(counted) * 100) - expected;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="date" value={date} />
      <Field label="Opening cash (₹)" hint="Cash in the drawer when the day started">
        <Input name="openingCash" type="number" min={0} step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} required />
      </Field>
      <p className="text-sm text-stone-600">
        Expected in drawer: <span className="font-semibold">{formatINR(expected)}</span> (opening + {formatINR(cashSales)} cash sales)
      </p>
      <Field label="Cash counted now (₹)">
        <Input name="countedCash" type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} required />
      </Field>
      {diff !== null && (
        <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${diff === 0 ? "bg-green-50 text-green-800" : diff < 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          {diff === 0 ? "Cash matches" : diff < 0 ? `Short by ${formatINR(-diff)}` : `Excess of ${formatINR(diff)}`}
        </p>
      )}
      <Field label="Cash taken out (₹)" hint="Deposited in the bank or handed to the owner. The rest is tomorrow's opening cash.">
        <Input name="cashWithdrawn" type="number" min={0} step="0.01" defaultValue="0" required />
      </Field>
      <Field label="Note">
        <Textarea name="note" rows={2} maxLength={300} placeholder="Reason for any difference" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Closing...">
        Close day
      </SubmitButton>
    </form>
  );
}
