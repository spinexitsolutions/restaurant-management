"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Input } from "./ui";

/** Asks for an owner/manager approval PIN. */
export function PinDialog({ onSubmit, onCancel, error }: { onSubmit: (pin: string) => void; onCancel: () => void; error?: string | null }) {
  const [pin, setPin] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <form
        className="w-full max-w-xs rounded-xl bg-white p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(pin);
        }}
      >
        <ShieldCheck className="mx-auto mb-2 text-brand-600" size={32} />
        <h2 className="font-semibold">Manager approval</h2>
        <p className="mb-4 text-sm text-stone-500">Ask an owner or manager to enter their PIN.</p>
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.5em]"
          aria-label="PIN"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pin.length < 4}>
            Approve
          </Button>
        </div>
      </form>
    </div>
  );
}
