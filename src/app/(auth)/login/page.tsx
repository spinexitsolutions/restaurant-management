"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, Field, FormMessage, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action] = useActionState(login, null);
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="mb-5 text-sm text-stone-500">Owners and staff use the same login.</p>
      <form action={action} className="space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FormMessage state={state} />
        <SubmitButton className="w-full" pendingText="Logging in...">
          Log in
        </SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-stone-500">
        New restaurant?{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:underline">
          Start free trial
        </Link>
      </p>
    </Card>
  );
}
