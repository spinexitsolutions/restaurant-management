"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { requestBooking } from "../../actions";

export function BookingForm({ slug, today }: { slug: string; today: string }) {
  const [state, action, pending] = useActionState(requestBooking, null);
  if (state?.ok) {
    return (
      <div className="py-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-green-600" size={40} />
        <p className="text-lg font-semibold">Request sent!</p>
        <p className="mt-1 text-sm text-stone-600">The restaurant will confirm your table on WhatsApp or by phone.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Your name">
        <Input name="name" required autoComplete="name" />
      </Field>
      <Field label="Mobile (WhatsApp)">
        <Input name="phone" inputMode="numeric" maxLength={10} required autoComplete="tel-national" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Guests">
          <Input name="partySize" type="number" min={1} max={50} defaultValue={2} required />
        </Field>
        <Field label="Date">
          <Input name="date" type="date" min={today} defaultValue={today} required />
        </Field>
        <Field label="Time">
          <Input name="time" type="time" defaultValue="20:00" required />
        </Field>
      </div>
      <Field label="Anything we should know?">
        <Input name="note" maxLength={200} placeholder="Birthday, high chair, window seat..." />
      </Field>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60" style={{ background: "var(--theme)" }}>
        {pending ? "Sending..." : "Request booking"}
      </button>
    </form>
  );
}
