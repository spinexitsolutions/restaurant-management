"use client";

import { useActionState, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { requestAccountDeletion, undoAccountDeletion } from "./actions";

export function ExportForm({ kinds, from, to }: { kinds: { kind: string; label: string; dated: boolean }[]; from: string; to: string }) {
  const [range, setRange] = useState({ from, to });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Field label="From">
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {kinds.map((k) => (
          <a
            key={k.kind}
            href={`/api/export/${k.kind}${k.dated ? `?from=${range.from}&to=${range.to}` : ""}`}
            className="flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium ring-1 ring-stone-200 hover:bg-stone-50"
          >
            {k.label}
            <Download size={16} className="text-stone-400" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function DeleteAccountForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(requestAccountDeletion, null);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <Field label={`Type "${name}" to confirm`}>
        <Input name="confirm" required autoComplete="off" />
      </Field>
      <Field label="Your password">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <Button variant="danger" disabled={pending}>
        Delete my account
      </Button>
    </form>
  );
}

export function UndoDeletionButton() {
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} onClick={() => start(() => undoAccountDeletion())}>
      Cancel deletion, keep my account
    </Button>
  );
}
