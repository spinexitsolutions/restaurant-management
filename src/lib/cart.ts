// Customer cart logic shared by the QR menu (and later the waiter app / POS).

export interface MenuItemData {
  id: string;
  name: string;
  description: string | null;
  price: number; // paise
  imageUrl: string | null;
  foodType: "VEG" | "NON_VEG" | "EGG";
  gstRate: number;
  isAvailable: boolean;
  isBestseller: boolean;
  spiceLevel: number;
  variants: { id: string; name: string; price: number }[];
  addonGroups: { id: string; name: string; minSelect: number; maxSelect: number; options: { id: string; name: string; price: number }[] }[];
}

export interface CartLine {
  key: string; // item + variant + addons, so identical customisations merge
  itemId: string;
  variantId: string | null;
  addonIds: string[];
  name: string;
  variantName: string | null;
  addons: { name: string; price: number }[];
  unitPrice: number; // paise, variant/base + addons
  gstRate: number;
  quantity: number;
}

export function buildCartLine(item: MenuItemData, variantId: string | null, addonIds: string[]): CartLine {
  const variant = item.variants.find((v) => v.id === variantId) ?? null;
  const options = item.addonGroups.flatMap((g) => g.options).filter((o) => addonIds.includes(o.id));
  const base = variant ? variant.price : item.price;
  return {
    key: [item.id, variant?.id ?? "", ...options.map((o) => o.id).sort()].join("|"),
    itemId: item.id,
    variantId: variant?.id ?? null,
    addonIds: options.map((o) => o.id),
    name: item.name,
    variantName: variant?.name ?? null,
    addons: options.map((o) => ({ name: o.name, price: o.price })),
    unitPrice: base + options.reduce((s, o) => s + o.price, 0),
    gstRate: item.gstRate,
    quantity: 1,
  };
}

/** Returns an error message if the add-on selection breaks a group's min/max rule. */
export function validateAddons(item: MenuItemData, addonIds: string[]): string | null {
  for (const g of item.addonGroups) {
    const n = g.options.filter((o) => addonIds.includes(o.id)).length;
    if (n < g.minSelect) return `Choose at least ${g.minSelect} in "${g.name}"`;
    if (n > g.maxSelect) return `Choose at most ${g.maxSelect} in "${g.name}"`;
  }
  return null;
}

export function addToCart(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.find((l) => l.key === line.key);
  if (existing) return cart.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l));
  return [...cart, line];
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  return quantity <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, quantity } : l));
}

export function lineLabel(l: CartLine): string {
  const extras = [l.variantName, ...l.addons.map((a) => a.name)].filter(Boolean);
  return extras.length ? `${l.name} (${extras.join(", ")})` : l.name;
}

export function buildWhatsAppOrderText(opts: {
  restaurantName: string;
  table: string | null;
  customerName: string;
  note: string;
  lines: CartLine[];
  totalLabel: string;
  formatPrice: (paise: number) => string;
}): string {
  const header = opts.table ? `*New order · Table ${opts.table}*` : "*New order*";
  const items = opts.lines.map((l, i) => `${i + 1}. ${l.quantity} x ${lineLabel(l)} = ${opts.formatPrice(l.unitPrice * l.quantity)}`);
  const details = [opts.customerName && `Name: ${opts.customerName}`, opts.note && `Note: ${opts.note}`].filter(Boolean);
  return [[header, opts.restaurantName].join("\n"), items.join("\n"), [`*${opts.totalLabel}*`, ...details].join("\n")].join("\n\n");
}
