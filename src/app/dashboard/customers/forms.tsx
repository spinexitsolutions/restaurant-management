"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { adjustPoints, createCustomer, updateCustomer } from "./actions";

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
