"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Badge, Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ImageUpload } from "@/components/image-upload";
import { calculateBill, formatINR } from "@/lib/gst";
import type { OnlinePaymentMode } from "@/lib/payments";
import { removeRazorpay, saveAggregators, saveGst, saveLoyalty, saveMenuSettings, savePaymentBasics, saveProfile, saveRazorpay, saveWhatsApp, sendTestWhatsApp } from "./actions";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mb-4 text-sm text-stone-500">{description}</p>}
      <div className={description ? "" : "mt-4"}>{children}</div>
    </Card>
  );
}

function Toggle({ name, label, defaultChecked, onChange }: { name: string; label: string; defaultChecked: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.target.checked)} className="h-4 w-4 accent-brand-600" />
      {label}
    </label>
  );
}

export function ProfileForm({ r }: { r: Record<string, string> }) {
  const [state, action] = useActionState(saveProfile, null);
  return (
    <Section title="Restaurant details" description="Printed on invoices and shown on your customer menu.">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Restaurant name">
            <Input name="name" defaultValue={r.name} required />
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={r.phone} />
          </Field>
        </div>
        <Field label="Address">
          <Textarea name="address" rows={2} defaultValue={r.address} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City">
            <Input name="city" defaultValue={r.city} />
          </Field>
          <Field label="State">
            <Input name="state" defaultValue={r.state} />
          </Field>
          <Field label="PIN code">
            <Input name="pincode" defaultValue={r.pincode} inputMode="numeric" maxLength={6} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Email">
            <Input name="email" type="email" defaultValue={r.email} />
          </Field>
          <Field label="FSSAI licence no.">
            <Input name="fssaiNumber" defaultValue={r.fssaiNumber} inputMode="numeric" maxLength={14} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Logo">
              <ImageUpload name="logoUrl" value={r.logoUrl} maxSize={400} label="Upload logo" />
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

export function MenuSettingsForm({ r }: { r: { qrOrderingEnabled: boolean; autoAcceptQrOrders: boolean; whatsappOrderingEnabled: boolean; whatsappNumber: string; menuThemeColor: string } }) {
  const [state, action] = useActionState(saveMenuSettings, null);
  return (
    <Section title="Customer QR menu" description="How customers order after scanning the table QR.">
      <form action={action} className="space-y-4">
        <Toggle name="qrOrderingEnabled" label="Customers can place orders from the QR menu" defaultChecked={r.qrOrderingEnabled} />
        <Toggle
          name="autoAcceptQrOrders"
          label="Send QR orders straight to the kitchen (otherwise a waiter accepts them first)"
          defaultChecked={r.autoAcceptQrOrders}
        />
        <Toggle name="whatsappOrderingEnabled" label="Show 'Order on WhatsApp' button" defaultChecked={r.whatsappOrderingEnabled} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp number for orders" hint="The customer's order message is sent to this number">
            <Input name="whatsappNumber" defaultValue={r.whatsappNumber} inputMode="numeric" maxLength={10} placeholder="9876543210" />
          </Field>
          <Field label="Menu colour">
            <Input name="menuThemeColor" type="color" defaultValue={r.menuThemeColor} className="p-1" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

export function GstForm({
  r,
}: {
  r: { gstEnabled: boolean; gstin: string; gstMode: "INCLUSIVE" | "EXCLUSIVE"; defaultGstRate: string; serviceChargeEnabled: boolean; serviceChargeRate: string; invoicePrefix: string; requireManagerPin: boolean };
}) {
  const [state, action] = useActionState(saveGst, null);
  const [preview, setPreview] = useState({
    gstEnabled: r.gstEnabled,
    mode: r.gstMode,
    rate: r.defaultGstRate,
    sc: r.serviceChargeEnabled,
    scRate: r.serviceChargeRate,
  });
  const bill = useMemo(
    () =>
      calculateBill([{ unitPrice: 50000, quantity: 1, gstRate: Number(preview.rate) || 0 }], {
        gstEnabled: preview.gstEnabled,
        mode: preview.mode,
        serviceChargeRate: preview.sc ? Number(preview.scRate) || 0 : 0,
      }),
    [preview],
  );

  return (
    <Section title="GST & billing" description="Restaurants usually charge 5% GST (2.5% CGST + 2.5% SGST). Check your rate with your CA.">
      <form action={action} className="space-y-4">
        <Toggle name="gstEnabled" label="I am GST registered (charge GST on bills)" defaultChecked={r.gstEnabled} onChange={(v) => setPreview((p) => ({ ...p, gstEnabled: v }))} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GSTIN">
            <Input name="gstin" defaultValue={r.gstin} maxLength={15} placeholder="27ABCDE1234F1Z0" className="uppercase" />
          </Field>
          <Field label="Menu prices are">
            <Select name="gstMode" defaultValue={r.gstMode} onChange={(e) => setPreview((p) => ({ ...p, mode: e.target.value as "INCLUSIVE" | "EXCLUSIVE" }))}>
              <option value="EXCLUSIVE">Exclusive (GST added on top)</option>
              <option value="INCLUSIVE">Inclusive (GST included in price)</option>
            </Select>
          </Field>
          <Field label="Default GST rate (%)">
            <Select name="defaultGstRate" defaultValue={String(Number(r.defaultGstRate))} onChange={(e) => setPreview((p) => ({ ...p, rate: e.target.value }))}>
              {["0", "5", "12", "18", "28"].map((x) => (
                <option key={x} value={x}>
                  {x}%
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <div className="pb-2">
            <Toggle name="serviceChargeEnabled" label="Add service charge" defaultChecked={r.serviceChargeEnabled} onChange={(v) => setPreview((p) => ({ ...p, sc: v }))} />
          </div>
          <Field label="Service charge (%)" hint="Must be optional for the customer">
            <Input name="serviceChargeRate" type="number" min={0} max={20} step="0.5" defaultValue={r.serviceChargeRate} onChange={(e) => setPreview((p) => ({ ...p, scRate: e.target.value }))} />
          </Field>
          <Field label="Invoice number prefix">
            <Input name="invoicePrefix" defaultValue={r.invoicePrefix} maxLength={5} className="uppercase" />
          </Field>
        </div>

        <Toggle
          name="requireManagerPin"
          label="Cashiers and waiters need a manager PIN for discounts, reopening bills and cancelling started food"
          defaultChecked={r.requireManagerPin}
        />
        <div className="rounded-lg bg-stone-50 p-4 text-sm">
          <p className="mb-2 font-medium">Preview: a ₹500 menu item</p>
          <dl className="space-y-1">
            <Row label="Taxable value" value={formatINR(bill.taxableValue - bill.serviceCharge)} />
            {bill.serviceCharge > 0 && <Row label="Service charge" value={formatINR(bill.serviceCharge)} />}
            {bill.slabs.filter((s) => s.gstRate > 0).map((s) => (
              <div key={s.gstRate}>
                <Row label={`CGST @ ${s.gstRate / 2}%`} value={formatINR(s.cgst)} />
                <Row label={`SGST @ ${s.gstRate / 2}%`} value={formatINR(s.sgst)} />
              </div>
            ))}
            {bill.roundOff !== 0 && <Row label="Round off" value={formatINR(bill.roundOff)} />}
            <div className="border-t border-stone-200 pt-1 font-semibold">
              <Row label="Customer pays" value={formatINR(bill.grandTotal)} />
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-600">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const MODE_LABEL: Record<OnlinePaymentMode, { text: string; tone: "green" | "amber" | "red" }> = {
  RAZORPAY: { text: "Active: Razorpay", tone: "green" },
  UPI_QR: { text: "Active: UPI QR", tone: "amber" },
  NONE: { text: "No online payment set up", tone: "red" },
};

export function PaymentBasicsForm({
  r,
  mode,
  upiPreview,
}: {
  r: { upiId: string; upiPayeeName: string; acceptCash: boolean; acceptCard: boolean };
  mode: OnlinePaymentMode;
  upiPreview: string | null;
}) {
  const [state, action] = useActionState(savePaymentBasics, null);
  return (
    <Section title="Payments" description="Until you add Razorpay keys, customers pay by scanning a UPI QR with the bill amount filled in.">
      <div className="mb-4">
        <Badge tone={MODE_LABEL[mode].tone}>{MODE_LABEL[mode].text}</Badge>
      </div>
      <form action={action} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 space-y-4">
            <Field label="UPI ID" hint="Payments go directly to this account">
              <Input name="upiId" defaultValue={r.upiId} placeholder="yourname@okhdfcbank" />
            </Field>
            <Field label="Name shown in UPI apps">
              <Input name="upiPayeeName" defaultValue={r.upiPayeeName} />
            </Field>
          </div>
          {upiPreview && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upiPreview} alt="UPI QR preview" className="h-36 w-36 rounded border border-stone-200" />
              <p className="mt-1 text-xs text-stone-500">Scan to test</p>
            </div>
          )}
        </div>
        <div className="flex gap-6">
          <Toggle name="acceptCash" label="Accept cash" defaultChecked={r.acceptCash} />
          <Toggle name="acceptCard" label="Accept card (machine at counter)" defaultChecked={r.acceptCard} />
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

export function RazorpayForm({ keyId, hasSecret, hasWebhookSecret, webhookUrl }: { keyId: string; hasSecret: boolean; hasWebhookSecret: boolean; webhookUrl: string }) {
  const [state, action] = useActionState(saveRazorpay, null);
  const [removeState, setRemoveState] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!keyId && hasSecret;

  return (
    <Section
      title="Razorpay (optional)"
      description="Add your own Razorpay API keys to accept UPI, cards and wallets with automatic payment confirmation. Money settles directly into your bank."
    >
      {connected && (
        <p className="mb-4 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={16} /> Connected with {keyId}
        </p>
      )}
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key ID">
            <Input name="keyId" defaultValue={keyId} placeholder="rzp_live_..." required />
          </Field>
          <Field label="Key Secret" hint={hasSecret ? "Saved. Leave blank to keep it." : undefined}>
            <Input name="keySecret" type="password" autoComplete="off" placeholder={hasSecret ? "••••••••••••" : ""} />
          </Field>
        </div>
        <Field label="Webhook secret (optional)" hint={hasWebhookSecret ? "Saved. Leave blank to keep it." : "Used to confirm payments even if the customer closes the page"}>
          <Input name="webhookSecret" type="password" autoComplete="off" placeholder={hasWebhookSecret ? "••••••••••••" : ""} />
        </Field>
        <p className="text-xs text-stone-500">
          Find your keys in Razorpay Dashboard → Account &amp; Settings → API Keys. Secrets are stored encrypted.
        </p>
        <p className="text-xs text-stone-500">
          Webhook URL (event <code>payment.captured</code>): <code className="rounded bg-stone-100 px-1 break-all">{webhookUrl}</code>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Verifying...">{connected ? "Update keys" : "Connect Razorpay"}</SubmitButton>
          {connected && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => confirm("Remove Razorpay? Payments will fall back to UPI QR.") && start(async () => setRemoveState(await removeRazorpay()))}
            >
              Remove
            </Button>
          )}
          <FormMessage state={removeState ?? state} />
        </div>
      </form>
    </Section>
  );
}

export function LoyaltyForm({
  r,
}: {
  r: { loyaltyEnabled: boolean; loyaltyEarnPer100: string; loyaltyPointValue: string; loyaltyMinRedeem: number; birthdayOfferText: string; reservationsEnabled: boolean };
}) {
  const [state, action] = useActionState(saveLoyalty, null);
  const [earn, setEarn] = useState(r.loyaltyEarnPer100);
  const [value, setValue] = useState(r.loyaltyPointValue);
  const back = ((Number(earn) || 0) * (Number(value) || 0)).toFixed(1);
  return (
    <Section title="Customers, loyalty & bookings" description="Customers are saved when you add their mobile number to a bill.">
      <form action={action} className="space-y-4">
        <Toggle name="loyaltyEnabled" label="Loyalty points: customers earn points on every paid bill" defaultChecked={r.loyaltyEnabled} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Points per ₹100 billed">
            <Input name="loyaltyEarnPer100" type="number" min={0} step="0.5" value={earn} onChange={(e) => setEarn(e.target.value)} />
          </Field>
          <Field label="Value of 1 point (₹)">
            <Input name="loyaltyPointValue" type="number" min={0.01} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Minimum points to redeem">
            <Input name="loyaltyMinRedeem" type="number" min={1} defaultValue={r.loyaltyMinRedeem} />
          </Field>
        </div>
        <p className="text-xs text-stone-500">Customers get back about {back}% of what they spend as points.</p>
        <Field label="Birthday / anniversary offer message" hint="{name} and {restaurant} are filled in automatically. Sent from your WhatsApp.">
          <Textarea name="birthdayOfferText" rows={2} defaultValue={r.birthdayOfferText} maxLength={500} />
        </Field>
        <Toggle name="reservationsEnabled" label="Let customers request a table online (booking link)" defaultChecked={r.reservationsEnabled} />
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

export function AggregatorForm({ r }: { r: { zomatoCommission: string; swiggyCommission: string } }) {
  const [state, action] = useActionState(saveAggregators, null);
  return (
    <Section
      title="Zomato & Swiggy"
      description="Punch aggregator orders from POS → Zomato / Swiggy so they reach the kitchen, stock and reports. Their bills carry no GST because the platform pays it (Section 9(5))."
    >
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zomato commission (%)">
            <Input name="zomatoCommission" type="number" min={0} max={60} step="0.5" defaultValue={r.zomatoCommission} />
          </Field>
          <Field label="Swiggy commission (%)">
            <Input name="swiggyCommission" type="number" min={0} max={60} step="0.5" defaultValue={r.swiggyCommission} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </Section>
  );
}

export function WhatsAppForm({
  r,
  log,
}: {
  r: { waPhoneNumberId: string; hasToken: boolean; waTemplateLang: string; waBillTemplate: string; waBookingTemplate: string; waBirthdayTemplate: string; waSummaryTemplate: string };
  log: { id: string; when: string; to: string; kind: string; status: string; error: string | null }[];
}) {
  const [state, action] = useActionState(saveWhatsApp, null);
  const [test, setTest] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!r.waPhoneNumberId && r.hasToken;
  return (
    <Section
      title="WhatsApp Business (automatic messages)"
      description="Send bills, booking confirmations, birthday wishes and a daily summary automatically, using the WhatsApp Cloud API from Meta. Without this, WhatsApp buttons open a ready-made message for you to send."
    >
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Phone number ID">
            <Input name="waPhoneNumberId" defaultValue={r.waPhoneNumberId} inputMode="numeric" placeholder="1234567890" />
          </Field>
          <Field label="Access token" hint={r.hasToken ? "Saved. Leave blank to keep it." : "Permanent token from a system user"}>
            <Input name="waAccessToken" type="password" autoComplete="off" placeholder={r.hasToken ? "••••••••••••" : ""} />
          </Field>
          <Field label="Template language">
            <Input name="waTemplateLang" defaultValue={r.waTemplateLang} placeholder="en" />
          </Field>
        </div>
        <p className="text-xs text-stone-500">Approved template names. Leave blank to turn that message off. Body variables, in order:</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill after payment" hint="{{1}} name, {{2}} restaurant, {{3}} amount, {{4}} bill link">
            <Input name="waBillTemplate" defaultValue={r.waBillTemplate} placeholder="bill_ready" />
          </Field>
          <Field label="Booking confirmed" hint="{{1}} name, {{2}} restaurant, {{3}} date & time, {{4}} guests">
            <Input name="waBookingTemplate" defaultValue={r.waBookingTemplate} placeholder="booking_confirmed" />
          </Field>
          <Field label="Birthday / anniversary (sent at 9 AM)" hint="{{1}} name, {{2}} restaurant">
            <Input name="waBirthdayTemplate" defaultValue={r.waBirthdayTemplate} placeholder="birthday_offer" />
          </Field>
          <Field label="Daily summary to owner (9 AM)" hint="{{1}} restaurant, {{2}} date, {{3}} sales, {{4}} bills">
            <Input name="waSummaryTemplate" defaultValue={r.waSummaryTemplate} placeholder="daily_summary" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          {connected && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setTest(await sendTestWhatsApp()))}>
              {pending ? "Sending..." : "Send test message"}
            </Button>
          )}
          <FormMessage state={test ?? state} />
        </div>
      </form>
      {log.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Recent messages</p>
          <ul className="divide-y divide-stone-100 text-xs">
            {log.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-2 py-1.5">
                <span className="w-32 text-stone-500">{m.when}</span>
                <span className="w-24">{m.kind}</span>
                <span className="w-28">{m.to}</span>
                <span className={m.status === "SENT" ? "text-green-700" : "text-red-600"}>
                  {m.status}
                  {m.error && `: ${m.error}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
