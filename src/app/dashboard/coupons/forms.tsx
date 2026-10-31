"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Card, Field, FormMessage, Input, Select } from "@/components/ui";
import { createCoupon, setWinbackCoupon, toggleCoupon } from "./actions";

export function CouponForm() {
  const [state, action, pending] = useActionState(createCoupon, null);
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  return (
    <Card>
      <form action={action} className="space-y-3">
        <p className="font-semibold">New coupon</p>
        <Field label="Code">
          <Input name="code" required placeholder="WEEKEND20" className="font-mono uppercase" maxLength={20} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FLAT")}>
              <option value="PERCENT">% off</option>
              <option value="FLAT">₹ off</option>
            </Select>
          </Field>
          <Field label={type === "PERCENT" ? "Percent" : "Amount (₹)"}>
            <Input name="value" type="number" min={1} step="any" required placeholder={type === "PERCENT" ? "20" : "100"} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {type === "PERCENT" && (
            <Field label="Max discount (₹)">
              <Input name="maxDiscount" type="number" min={1} placeholder="No cap" />
            </Field>
          )}
          <Field label="Min bill (₹)">
            <Input name="minBill" type="number" min={0} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts">
            <Input name="validFrom" type="date" />
          </Field>
          <Field label="Ends">
            <Input name="validTo" type="date" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Total uses">
            <Input name="usageLimit" type="number" min={1} placeholder="Unlimited" />
          </Field>
          <Field label="Per customer">
            <Input name="perCustomerLimit" type="number" min={1} placeholder="Unlimited" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="firstOrderOnly" /> Only for a customer&apos;s first order
        </label>
        <Field label="Note for staff (optional)">
          <Input name="description" maxLength={120} placeholder="Diwali offer" />
        </Field>
        <FormMessage state={state} />
        <Button className="w-full" disabled={pending}>
          Create coupon
        </Button>
      </form>
    </Card>
  );
}

export function CouponRowActions({ id, isActive, inWinback }: { id: string; isActive: boolean; inWinback: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {isActive && !inWinback && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setWinbackCoupon(id);
            })
          }
        >
          Use in win-back
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={() => start(() => toggleCoupon(id, !isActive))}>
        {isActive ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
