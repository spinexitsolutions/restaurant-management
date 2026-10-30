"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, ExternalLink, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addTables, deleteTable, regenerateQr, updateTable } from "./actions";

export function AddTablesForm() {
  const [state, action] = useActionState(addTables, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Prefix">
          <Input name="prefix" defaultValue="T" />
        </Field>
        <Field label="From">
          <Input name="from" type="number" min={0} defaultValue={1} required />
        </Field>
        <Field label="To">
          <Input name="to" type="number" min={0} defaultValue={10} required />
        </Field>
        <Field label="Seats">
          <Input name="capacity" type="number" min={1} defaultValue={4} required />
        </Field>
        <div className="col-span-2">
          <Field label="Area (optional)">
            <Input name="area" placeholder="AC Hall, Rooftop..." />
          </Field>
        </div>
      </div>
      <p className="text-xs text-stone-500">Example: prefix &quot;R&quot;, from 1 to 5 creates R1, R2, R3, R4, R5.</p>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Adding...">Add tables</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

type Table = { id: string; name: string; area: string; capacity: number; url: string; qr: string };

export function TableCard({ table }: { table: Table }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: table.name, area: table.area, capacity: String(table.capacity) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col items-center p-4 text-center">
      {editing ? (
        <div className="w-full space-y-2 text-left">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
          <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Area" />
          <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="Seats" />
          {error && <FormMessage state={{ error }} />}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateTable({ id: table.id, ...form });
                  if (res?.error) setError(res.error);
                  else setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-lg font-semibold">{table.name}</p>
          <p className="text-xs text-stone-500">{table.capacity} seats</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={table.qr} alt={`QR code for table ${table.name}`} className="my-3 h-40 w-40" />
          <div className="flex gap-1">
            <a href={table.qr} download={`table-${table.name}-qr.png`} className="rounded p-2 text-stone-500 hover:bg-stone-100" title="Download QR">
              <Download size={16} />
            </a>
            <a href={table.url} target="_blank" className="rounded p-2 text-stone-500 hover:bg-stone-100" title="Open menu as this table">
              <ExternalLink size={16} />
            </a>
            <button className="rounded p-2 text-stone-500 hover:bg-stone-100" onClick={() => setEditing(true)} title="Edit">
              <Pencil size={16} />
            </button>
            <button
              className="rounded p-2 text-stone-500 hover:bg-stone-100"
              disabled={pending}
              title="New QR (old printed QR will stop working)"
              onClick={() => confirm("Generate a new QR? The old printed QR for this table will stop working.") && start(() => regenerateQr(table.id))}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="rounded p-2 text-stone-500 hover:bg-red-50 hover:text-red-600"
              disabled={pending}
              title="Delete"
              onClick={() => confirm(`Delete table ${table.name}?`) && start(() => deleteTable(table.id))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
