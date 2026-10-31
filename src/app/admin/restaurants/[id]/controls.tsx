"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { assignReseller, extendPlan, extendTrial, resetOwnerPassword, saveAdminNote, supportLogin, toggleRestaurant } from "../../actions";

export function ExtendPlanForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(extendPlan, null);
  const [trialPending, start] = useTransition();
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-3">
        <input type="hidden" name="id" value={id} />
        <label className="text-xs text-stone-600">
          Paid offline
          <Select name="months" className="mt-1 w-24">
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {m} month{m > 1 ? "s" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-stone-600">
          Amount ₹ (before GST)
          <Input name="amount" type="number" min={0} required className="mt-1 w-32" />
        </label>
        <label className="text-xs text-stone-600">
          UTR / note
          <Input name="note" maxLength={80} className="mt-1 w-40" />
        </label>
        <Button disabled={pending}>Record & extend</Button>
      </form>
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-600">Free days:</span>
        {[7, 14, 30].map((d) => (
          <Button key={d} variant="secondary" size="sm" disabled={trialPending} onClick={() => start(() => extendTrial(id, d))}>
            +{d} days
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RestaurantActions({ id, isActive, hasOwner }: { id: string; isActive: boolean; hasOwner: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !hasOwner || !isActive}
          onClick={() =>
            confirm("Open this restaurant's dashboard as the owner for 2 hours? It is recorded in their activity log.") &&
            start(async () => {
              const res = await supportLogin(id);
              if (res && !res.ok) setMsg({ error: res.error });
            })
          }
        >
          Log in as owner (support)
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            confirm("Give the owner a new temporary password? They will be signed out everywhere.") &&
            start(async () => {
              const res = await resetOwnerPassword(id);
              setMsg(res.ok ? { ok: `Login: ${res.email} · Temporary password: ${res.password} (share privately)` } : { error: res.error });
            })
          }
        >
          Reset owner password
        </Button>
        <Button
          variant={isActive ? "danger" : "secondary"}
          disabled={pending}
          onClick={() => confirm(isActive ? "Suspend? Staff and the QR menu stop working." : "Activate again?") && start(() => toggleRestaurant(id))}
        >
          {isActive ? "Suspend" : "Activate"}
        </Button>
      </div>
      <FormMessage state={msg} />
    </div>
  );
}

export function AdminNote({ id, note }: { id: string; note: string }) {
  const [value, setValue] = useState(note);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <p className="mb-1 text-sm font-medium">Private notes</p>
      <Textarea rows={3} value={value} onChange={(e) => (setValue(e.target.value), setSaved(false))} placeholder="Called on 3 Nov, wants yearly plan after Diwali…" />
      <div className="mt-1 flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={pending || value === note} onClick={() => start(async () => (await saveAdminNote(id, value), setSaved(true)))}>
          Save note
        </Button>
        {saved && <span className="text-xs text-green-700">Saved</span>}
      </div>
    </div>
  );
}

export function PartnerSelect({ restaurantId, current, options }: { restaurantId: string; current: string; options: { id: string; name: string; code: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="block text-sm">
      <span className="font-medium">Partner (gets commission on renewals)</span>
      <Select className="mt-1" defaultValue={current} disabled={pending} onChange={(e) => start(() => assignReseller(restaurantId, e.target.value))}>
        <option value="">None (direct customer)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.code})
          </option>
        ))}
      </Select>
    </label>
  );
}
