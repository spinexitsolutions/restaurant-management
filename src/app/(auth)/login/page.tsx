"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Card, Field, FormMessage, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { login, loginWithCode, requestCode } from "../actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "otp">("password");
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="mb-4 text-sm text-stone-500">Owners and staff use the same login.</p>
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm">
        {(["password", "otp"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-md py-1.5 font-medium", mode === m ? "bg-white shadow-sm" : "text-stone-500")}>
            {m === "password" ? "Password" : "One-time code"}
          </button>
        ))}
      </div>
      {mode === "password" ? <PasswordLogin /> : <OtpLogin />}
      <p className="mt-5 text-center text-sm text-stone-500">
        New restaurant?{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:underline">
          Start free trial
        </Link>
      </p>
    </Card>
  );
}

function PasswordLogin() {
  const [state, action] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-sm text-brand-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Logging in...">
        Log in
      </SubmitButton>
    </form>
  );
}

function OtpLogin() {
  const [sent, send] = useActionState(requestCode, null);
  const [verified, verify] = useActionState(loginWithCode, null);
  const state = verified ?? sent;
  const identifier = verified?.identifier ?? sent?.identifier;
  if (state?.step !== "code") {
    return (
      <form action={send} className="space-y-4">
        <input type="hidden" name="purpose" value="LOGIN" />
        <Field label="Mobile number or email" hint="We'll send a 6-digit code on WhatsApp, SMS or email.">
          <Input name="identifier" autoComplete="username" required />
        </Field>
        <FormMessage state={sent} />
        <SubmitButton className="w-full" pendingText="Sending...">
          Send code
        </SubmitButton>
      </form>
    );
  }
  return (
    <form action={verify} className="space-y-4">
      <input type="hidden" name="identifier" value={identifier} />
      {!verified && <FormMessage state={sent} />}
      <Field label="6-digit code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required className="text-center text-xl tracking-[0.4em]" />
      </Field>
      {verified?.error && <FormMessage state={verified} />}
      <SubmitButton className="w-full" pendingText="Checking...">
        Log in
      </SubmitButton>
    </form>
  );
}
