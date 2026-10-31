"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, Field, FormMessage, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requestCode, resetPassword } from "../actions";

export default function ForgotPasswordPage() {
  const [sent, send] = useActionState(requestCode, null);
  const [reset, doReset] = useActionState(resetPassword, null);
  const identifier = reset?.identifier ?? sent?.identifier;
  const onCodeStep = (reset ?? sent)?.step === "code";

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Reset password</h1>
      <p className="mb-5 text-sm text-stone-500">
        {onCodeStep ? "Enter the code and choose a new password. You'll be signed out on every other device." : "Enter the email or mobile number on your account."}
      </p>
      {!onCodeStep ? (
        <form action={send} className="space-y-4">
          <input type="hidden" name="purpose" value="RESET" />
          <Field label="Email or mobile number">
            <Input name="identifier" autoComplete="username" required />
          </Field>
          <FormMessage state={sent} />
          <SubmitButton className="w-full" pendingText="Sending...">
            Send code
          </SubmitButton>
        </form>
      ) : (
        <form action={doReset} className="space-y-4">
          <input type="hidden" name="identifier" value={identifier} />
          {!reset && <FormMessage state={sent} />}
          <Field label="6-digit code">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required className="text-center text-xl tracking-[0.4em]" />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          {reset?.error && <FormMessage state={reset} />}
          <SubmitButton className="w-full" pendingText="Saving...">
            Set new password
          </SubmitButton>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-stone-500">
        Staff can also ask their owner or manager to reset it from the Staff page.{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to login
        </Link>
      </p>
    </Card>
  );
}
