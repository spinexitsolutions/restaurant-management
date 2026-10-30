"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Badge, Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { addReservation, updateReservation } from "./actions";

type Table = { id: string; name: string; capacity: number };

export function AddReservationForm({ tables, defaultDate }: { tables: Table[]; defaultDate: string }) {
  const [state, action] = useActionState(addReservation, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Mobile">
          <Input name="phone" inputMode="numeric" maxLength={10} required />
        </Field>
        <Field label="Guests">
          <Input name="partySize" type="number" min={1} max={50} defaultValue={2} required />
        </Field>
        <Field label="Table (optional)">
          <Select name="tableId" defaultValue="">
            <option value="">Assign later</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.capacity} seats)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input name="date" type="date" defaultValue={defaultDate} required />
        </Field>
        <Field label="Time">
          <Input name="time" type="time" defaultValue="20:00" required />
        </Field>
        <div className="col-span-2">
          <Field label="Note">
            <Input name="note" placeholder="Birthday, window seat, high chair..." maxLength={200} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Save booking</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

const TONE = { REQUESTED: "amber", CONFIRMED: "green", SEATED: "brand", CANCELLED: "red", NO_SHOW: "red" } as const;

export function ReservationRow({
  r,
  tables,
  restaurantName,
}: {
  r: { id: string; name: string; phone: string; partySize: number; startsAt: string; status: keyof typeof TONE; tableId: string | null; tableName: string | null; note: string | null; source: string };
  tables: Table[];
  restaurantName: string;
}) {
  const [pending, start] = useTransition();
  const time = new Date(r.startsAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const day = new Date(r.startsAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const update = (patch: { status?: "CONFIRMED" | "SEATED" | "CANCELLED" | "NO_SHOW"; tableId?: string | null }) =>
    start(async () => {
      const res = await updateReservation({ id: r.id, ...patch });
      if (res?.error) alert(res.error);
    });
  const confirmText = `Hi ${r.name}, your table for ${r.partySize} at ${restaurantName} is confirmed for ${day}, ${time}${r.tableName ? ` (Table ${r.tableName})` : ""}. See you soon!`;
  const closed = r.status === "CANCELLED" || r.status === "NO_SHOW";
  const assigned = tables.find((t) => t.id === r.tableId);
  const small = assigned && assigned.capacity < r.partySize ? assigned : null;

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3 text-sm", closed && "opacity-50")}>
      <span className="w-20 shrink-0 text-base font-semibold">{time}</span>
      <div className="min-w-40 flex-1">
        <p className="font-medium">
          {r.name} · {r.partySize} guest{r.partySize > 1 ? "s" : ""} <Badge tone={TONE[r.status]}>{r.status.replace("_", " ")}</Badge>
          {r.source === "ONLINE" && <span className="ml-1 text-xs text-stone-400">online</span>}
        </p>
        <p className="text-xs text-stone-500">
          {r.phone}
          {r.note && ` · ${r.note}`}
        </p>
      </div>
      <div className="w-32 shrink-0">
        <Select className="h-8 text-xs" value={r.tableId ?? ""} disabled={pending || closed} onChange={(e) => update({ tableId: e.target.value || null })} aria-label="Table">
          <option value="">No table</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.capacity})
            </option>
          ))}
        </Select>
        {small && <p className="mt-0.5 text-[11px] text-amber-700">Only {small.capacity} seats</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        {r.status === "REQUESTED" && (
          <Button size="sm" disabled={pending} onClick={() => update({ status: "CONFIRMED" })}>
            Confirm
          </Button>
        )}
        {r.status === "CONFIRMED" && r.tableId && (
          <Link
            href={`/dashboard/orders/new?table=${r.tableId}`}
            onClick={() => update({ status: "SEATED" })}
            className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-xs font-medium text-white"
          >
            Seat & order
          </Link>
        )}
        {r.status === "CONFIRMED" && !r.tableId && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => update({ status: "SEATED" })}>
            Seated
          </Button>
        )}
        {(r.status === "REQUESTED" || r.status === "CONFIRMED") && (
          <>
            <a
              href={`https://wa.me/91${r.phone}?text=${encodeURIComponent(confirmText)}`}
              target="_blank"
              className="inline-flex h-8 items-center rounded-lg bg-[#25D366] px-2 text-white"
              title="Send confirmation on WhatsApp"
            >
              <MessageCircle size={14} />
            </a>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => update({ status: "NO_SHOW" })}>
              No-show
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Cancel this booking?") && update({ status: "CANCELLED" })}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
