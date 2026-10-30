"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, Field, FormMessage, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { signup } from "../actions";

export default function SignupPage() {
  const [state, action] = useActionState(signup, null);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Start your 14-day free trial</h1>
      <p className="mb-5 text-sm text-stone-500">No card required. Set up your restaurant in 2 minutes.</p>
      <form action={action} className="space-y-4">
        <Field label="Restaurant name">
          <Input name="restaurantName" placeholder="Sharma Dhaba" required />
        </Field>
        <Field label="Your name">
          <Input name="ownerName" required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Mobile (WhatsApp)">
            <Input name="phone" inputMode="numeric" maxLength={10} placeholder="9876543210" required />
          </Field>
        </div>
        <Field label="Password" hint="At least 8 characters">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="sampleMenu" defaultChecked className="h-4 w-4 accent-brand-600" />
          Add a sample menu so I can try things out
        </label>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Creating your restaurant...">
          Create restaurant
        </SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-stone-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
