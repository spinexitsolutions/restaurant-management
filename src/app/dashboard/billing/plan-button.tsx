"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { loadRazorpay, type CheckoutResponse } from "@/lib/client/razorpay-checkout";
import { confirmSubscription, startSubscription } from "./actions";

export function PlanButton({ code, label }: { code: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  function pay() {
    setMsg(null);
    start(async () => {
      const res = await startSubscription(code);
      if (!res.ok) return setMsg({ error: res.error });
      if (!(await loadRazorpay()) || !window.Razorpay) return setMsg({ error: "Couldn't load the payment page. Check your internet." });
      const d = res.data;
      new window.Razorpay({
        key: d.keyId,
        order_id: d.razorpayOrderId,
        amount: d.amount,
        currency: "INR",
        name: d.name,
        description: d.description,
        prefill: { email: d.email ?? undefined, contact: d.phone ?? undefined },
        theme: { color: "#ea580c" },
        handler: async (resp: CheckoutResponse) => {
          const done = await confirmSubscription(resp);
          setMsg(done.ok ? { ok: "Payment received. Thank you!" } : { error: done.error });
          router.refresh();
        },
      }).open();
    });
  }

  return (
    <div>
      <Button className="w-full" disabled={pending} onClick={pay}>
        {pending ? "Opening..." : label}
      </Button>
      {msg?.ok && <p className="mt-2 text-sm text-green-700">{msg.ok}</p>}
      {msg?.error && <p className="mt-2 text-sm text-red-600">{msg.error}</p>}
    </div>
  );
}
