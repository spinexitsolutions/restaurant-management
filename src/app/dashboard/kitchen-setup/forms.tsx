"use client";

import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addPrinter, addStation, deletePrinter, deleteStation, setCategoryStation, testPrinter } from "./actions";

export function AddStationForm() {
  const [state, action] = useActionState(addStation, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="w-56">
        <Field label="New station">
          <Input name="name" placeholder="Tandoor" required />
        </Field>
      </div>
      <SubmitButton>Add station</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function StationDelete({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-label={`Delete ${name}`}
      className="text-stone-400 hover:text-red-600"
      onClick={() => confirm(`Delete ${name}? Its dishes will go to the main kitchen.`) && start(() => deleteStation(id))}
    >
      <X size={14} />
    </button>
  );
}

export function CategoryStationSelect({ categoryId, value, stations }: { categoryId: string; value: string | null; stations: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="w-44">
      <Select className="h-8 text-xs" value={value ?? ""} disabled={pending} onChange={(e) => start(() => setCategoryStation(categoryId, e.target.value || null))} aria-label="Station">
        <option value="">Main kitchen</option>
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function AddPrinterForm({ stations }: { stations: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addPrinter, null);
  const [connection, setConnection] = useState("BROWSER");
  return (
    <form action={action} className="space-y-3 rounded-lg bg-stone-50 p-4">
      <p className="text-sm font-semibold">Add printer</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name">
          <Input name="name" placeholder="Kitchen printer" required />
        </Field>
        <Field label="Connected by">
          <Select name="connection" value={connection} onChange={(e) => setConnection(e.target.value)}>
            <option value="BROWSER">USB / Bluetooth / installed printer</option>
            <option value="AGENT">Network (LAN / Wi-Fi)</option>
          </Select>
        </Field>
        {connection === "AGENT" && (
          <Field label="IP address" hint="Usually port 9100">
            <Input name="address" placeholder="192.168.1.50:9100" />
          </Field>
        )}
        <Field label="Paper">
          <Select name="paperWidth" defaultValue="80">
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </Select>
        </Field>
        <Field label="KOTs for">
          <Select name="stationId" defaultValue="">
            <option value="">All items</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} only
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="printKot" defaultChecked className="h-4 w-4 accent-brand-600" /> Print KOTs
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="printBill" className="h-4 w-4 accent-brand-600" /> Print bills
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>Add printer</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PrinterActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-xs text-green-700">{msg}</span>}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setMsg((await testPrinter(id))?.ok ?? null))}>
        Test print
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Delete this printer?") && start(() => deletePrinter(id))}>
        Delete
      </Button>
    </span>
  );
}
