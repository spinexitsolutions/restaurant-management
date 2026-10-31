"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { createReseller, recordPayout, setResellerActive, setResellerRate } from "../actions";

export function NewResellerForm() {
  const [state, action, pending] = useActionState(createReseller, null);
  return (
    <Card className="h-fit">
      <form action={action} className="space-y-3">
        <p className="font-semibold">Add partner</p>
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Mobile">
          <Input name="phone" inputMode="numeric" maxLength={10} required />
        </Field>
        <Field label="Email" hint="They log in with this to see their restaurants and earnings">
          <Input name="email" type="email" required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Commission %">
            <Input name="commissionRate" type="number" min={0} max={100} step="0.5" defaultValue={20} required />
          </Field>
          <Field label="Code (optional)">
            <Input name="code" placeholder="Auto" maxLength={20} className="uppercase" />
          </Field>
        </div>
        <FormMessage state={state} />
        <Button className="w-full" disabled={pending}>
          Add partner
        </Button>
      </form>
    </Card>
  );
}

export function ResellerToggles({ id, isActive, rate }: { id: string; isActive: boolean; rate: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(rate));
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-sm text-stone-600">
        <Input className="h-8 w-16" type="number" min={0} max={100} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => Number(value) !== rate && start(() => setResellerRate(id, Number(value)))} />%
      </label>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => setResellerActive(id, !isActive))}>
        {isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

export function PayoutForm({ resellerId, due }: { resellerId: string; due: number }) {
  const [state, action, pending] = useActionState(recordPayout, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="resellerId" value={resellerId} />
      <Input name="amount" type="number" min={1} step="0.01" placeholder={due > 0 ? `₹${(due / 100).toFixed(0)}` : "₹"} className="h-8 w-28" required />
      <Input name="reference" placeholder="UTR / UPI ref" className="h-8 w-40" />
      <Button size="sm" variant="secondary" disabled={pending}>
        Record payout
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
