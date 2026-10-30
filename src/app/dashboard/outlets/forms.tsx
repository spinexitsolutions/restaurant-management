"use client";

import { useActionState, useTransition } from "react";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addOutlet, copyMenuBetween, switchOutlet } from "./actions";

export function SwitchButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => switchOutlet(id))}>
      {pending ? "Switching..." : "Switch"}
    </Button>
  );
}

export function OutletSwitcher({ outlets, current }: { outlets: { id: string; name: string }[]; current: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Outlet"
      disabled={pending}
      value={current}
      onChange={(e) => start(() => switchOutlet(e.target.value))}
      className="mt-0.5 w-full truncate rounded border-0 bg-transparent p-0 text-xs text-stone-500 focus:ring-0"
    >
      {outlets.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function AddOutletForm() {
  const [state, action] = useActionState(addOutlet, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Outlet name">
          <Input name="name" placeholder="Sharma Dhaba Andheri" required />
        </Field>
        <Field label="City / area">
          <Input name="city" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="copyMenu" defaultChecked className="h-4 w-4 accent-brand-600" /> Copy this outlet&apos;s menu
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Creating...">Create outlet</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CopyMenuForm({ outlets, current }: { outlets: { id: string; name: string }[]; current: string }) {
  const [state, action] = useActionState(copyMenuBetween, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <Select name="from" defaultValue={current}>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To">
          <Select name="to" defaultValue={outlets.find((o) => o.id !== current)?.id}>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Copying...">Copy menu</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
