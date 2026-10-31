"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { useTransition } from "react";
import { adjustPoints, createCustomer, markWinbackSent, setMarketingOptOut, updateCustomer } from "./actions";

// Month-day values are shown in a date picker using a fixed leap year (so 29 Feb works).
const asDate = (mmdd: string | null) => (mmdd ? `2024-${mmdd}` : "");

export function CustomerForm({
  customer,
}: {
  customer?: { id: string; phone: string; name: string | null; birthday: string | null; anniversary: string | null; notes: string | null };
}) {
  const [state, action] = useActionState(customer ? updateCustomer : createCustomer, null);
  return (
    <form action={action} className="space-y-3">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Mobile">
          <Input name="phone" inputMode="numeric" maxLength={10} defaultValue={customer?.phone} required />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={customer?.name ?? ""} />
        </Field>
        <Field label="Birthday" hint="Year is ignored">
          <Input name="birthday" type="date" defaultValue={asDate(customer?.birthday ?? null)} />
        </Field>
        <Field label="Anniversary">
          <Input name="anniversary" type="date" defaultValue={asDate(customer?.anniversary ?? null)} />
        </Field>
      </div>
      {customer && (
        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={customer.notes ?? ""} placeholder="Allergies, favourite table, preferences..." />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>{customer ? "Save" : "Add customer"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function AdjustPointsForm({ id }: { id: string }) {
  const [state, action] = useActionState(adjustPoints, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="w-28">
        <Field label="Points (+/-)">
          <Input name="points" type="number" required />
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="Reason">
          <Input name="note" required placeholder="Complaint goodwill" />
        </Field>
      </div>
      <SubmitButton variant="secondary">Adjust</SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function WinbackSendButton({ id, href }: { id: string; href: string }) {
  const [pending, start] = useTransition();
  return (
    <a
      href={href}
      target="_blank"
      onClick={() => start(() => markWinbackSent(id))}
      aria-disabled={pending}
      className="inline-flex items-center rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white"
    >
      Send offer
    </a>
  );
}

export function OptOutToggle({ id, optOut }: { id: string; optOut: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={optOut} disabled={pending} onChange={(e) => start(() => setMarketingOptOut(id, e.target.checked))} />
      Don&apos;t send offers or birthday messages to this customer
    </label>
  );
}
