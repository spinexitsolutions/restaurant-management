"use client";

import { useTransition } from "react";
import { resetOwnerPassword } from "./actions";

export function ResetOwnerButton({ restaurantId }: { restaurantId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs text-stone-500 hover:underline"
      onClick={() => {
        if (!confirm("Give the owner a new temporary password? They will be signed out everywhere.")) return;
        start(async () => {
          const res = await resetOwnerPassword(restaurantId);
          alert(res.ok ? `Login: ${res.email}\nTemporary password: ${res.password}\n\nShare it privately and ask them to change it.` : res.error);
        });
      }}
    >
      Reset owner password
    </button>
  );
}
