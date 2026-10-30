import { describe, expect, it } from "vitest";
import { addToCart, buildCartLine, buildWhatsAppOrderText, setQuantity, validateAddons, type MenuItemData } from "./cart";

const pizza: MenuItemData = {
  id: "pizza",
  name: "Margherita",
  description: null,
  price: 25000,
  imageUrl: null,
  foodType: "VEG",
  gstRate: 5,
  isAvailable: true,
  isBestseller: false,
  spiceLevel: 0,
  variants: [
    { id: "s", name: "Small", price: 20000 },
    { id: "l", name: "Large", price: 40000 },
  ],
  addonGroups: [
    {
      id: "g",
      name: "Toppings",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "cheese", name: "Extra cheese", price: 5000 },
        { id: "olive", name: "Olives", price: 3000 },
        { id: "corn", name: "Corn", price: 2000 },
      ],
    },
  ],
};

describe("cart", () => {
  it("prices a line from the variant plus add-ons", () => {
    const line = buildCartLine(pizza, "l", ["cheese", "olive"]);
    expect(line.unitPrice).toBe(48000);
    expect(line.variantName).toBe("Large");
  });

  it("merges identical customisations regardless of add-on order", () => {
    let cart = addToCart([], buildCartLine(pizza, "s", ["cheese", "olive"]));
    cart = addToCart(cart, buildCartLine(pizza, "s", ["olive", "cheese"]));
    cart = addToCart(cart, buildCartLine(pizza, "l", []));
    expect(cart).toHaveLength(2);
    expect(cart[0].quantity).toBe(2);
  });

  it("removes a line when quantity drops to zero", () => {
    const cart = addToCart([], buildCartLine(pizza, "s", []));
    expect(setQuantity(cart, cart[0].key, 0)).toEqual([]);
  });

  it("enforces add-on min/max", () => {
    expect(validateAddons(pizza, ["cheese", "olive", "corn"])).toMatch(/at most 2/);
    expect(validateAddons({ ...pizza, addonGroups: [{ ...pizza.addonGroups[0], minSelect: 1 }] }, [])).toMatch(/at least 1/);
    expect(validateAddons(pizza, ["cheese"])).toBeNull();
  });

  it("formats a WhatsApp order message", () => {
    const cart = addToCart([], { ...buildCartLine(pizza, "l", ["cheese"]), quantity: 2 });
    const text = buildWhatsAppOrderText({
      restaurantName: "Pizza Point",
      table: "T4",
      customerName: "Rahul",
      note: "Less spicy",
      lines: cart,
      totalLabel: "Total: ₹945",
      formatPrice: (p) => `₹${p / 100}`,
    });
    expect(text).toBe(
      "*New order · Table T4*\nPizza Point\n\n1. 2 x Margherita (Large, Extra cheese) = ₹900\n\n*Total: ₹945*\nName: Rahul\nNote: Less spicy",
    );
  });
});
