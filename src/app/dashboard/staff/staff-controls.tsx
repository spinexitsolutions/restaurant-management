"use client";

import { useActionState, useTransition } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createStaff, resetStaffPassword, setMyPin, setStaffRole, toggleStaffActive } from "./actions";

export function AddStaffForm({ canAddManager }: { canAddManager: boolean }) {
  const [state, action] = useActionState(createStaff, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Login email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Mobile">
          <Input name="phone" inputMode="numeric" maxLength={10} />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="WAITER">
            <option value="WAITER">Waiter</option>
            <option value="CHEF">Chef</option>
            <option value="CASHIER">Cashier</option>
            {canAddManager && <option value="MANAGER">Manager</option>}
          </Select>
        </Field>
        <Field label="Password">
          <Input name="password" type="text" minLength={6} required />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Adding...">Add staff</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function StaffRowControls(props: { id: string; role: string; isActive: boolean; canAssignManager: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string } | null>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
    });

  return (
    <div className="flex items-center justify-end gap-2">
      <Select
        className="h-8 w-28 text-xs"
        value={props.role}
        disabled={pending}
        onChange={(e) => run(() => setStaffRole(props.id, e.target.value))}
        aria-label="Role"
      >
        <option value="WAITER">Waiter</option>
        <option value="CHEF">Chef</option>
        <option value="CASHIER">Cashier</option>
        {(props.canAssignManager || props.role === "MANAGER") && <option value="MANAGER">Manager</option>}
      </Select>
      <button
        className="h-8 rounded-lg px-2 text-xs text-stone-600 hover:bg-stone-100"
        disabled={pending}
        onClick={() => {
          const pw = prompt("New password (min 6 characters)");
          if (pw) run(() => resetStaffPassword(props.id, pw));
        }}
      >
        Reset password
      </button>
      <button
        className={`h-8 rounded-lg px-2 text-xs ${props.isActive ? "text-red-600 hover:bg-red-50" : "text-green-700 hover:bg-green-50"}`}
        disabled={pending}
        onClick={() => run(() => toggleStaffActive(props.id))}
      >
        {props.isActive ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action] = useActionState(setMyPin, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label={hasPin ? "Change your PIN" : "Set your PIN"}>
        <Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required className="w-36" autoComplete="off" />
      </Field>
      <SubmitButton>{hasPin ? "Update PIN" : "Save PIN"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
