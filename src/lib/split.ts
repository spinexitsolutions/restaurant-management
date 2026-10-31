// Split-bill maths for customers paying their own share from their phones. Amounts in paise.

const MIN_PAYMENT = 100; // ₹1

/** Equal share of what's still due among `people`, rounded up to the rupee so the last payer isn't left with paise. */
export function equalShare(duePaise: number, people: number): number {
  if (people < 1 || duePaise <= 0) return 0;
  return Math.min(duePaise, Math.ceil(duePaise / people / 100) * 100);
}

/**
 * Share for the dishes someone ate: their items' menu value as a fraction of the whole order,
 * applied to the grand total so tax, discounts and service charge are split fairly.
 */
export function itemsShare(grandTotalPaise: number, orderItemsPaise: number, selectedPaise: number, duePaise: number): number {
  if (orderItemsPaise <= 0 || selectedPaise <= 0) return 0;
  return Math.min(duePaise, Math.round((grandTotalPaise * selectedPaise) / orderItemsPaise));
}

/** Validates a share; a payment that would leave less than ₹1 behind becomes the full amount due. */
export function normaliseShare(amountPaise: number, duePaise: number): { amount: number } | { error: string } {
  if (!Number.isFinite(amountPaise) || amountPaise < MIN_PAYMENT) return { error: "Enter at least ₹1" };
  if (amountPaise > duePaise) return { error: "That's more than what's left to pay" };
  return { amount: duePaise - amountPaise < MIN_PAYMENT ? duePaise : Math.round(amountPaise) };
}
