import type { FoodType, Prisma } from "@prisma/client";

// Starter menu so a new restaurant can see the QR menu working immediately.
const SAMPLE: { category: string; items: { name: string; price: number; foodType: FoodType; description?: string; bestseller?: boolean; variants?: [string, number][] }[] }[] = [
  {
    category: "Starters",
    items: [
      { name: "Paneer Tikka", price: 260, foodType: "VEG", description: "Cottage cheese marinated in spiced yogurt, char-grilled", bestseller: true },
      { name: "Chicken 65", price: 290, foodType: "NON_VEG", description: "Crispy fried chicken tossed with curry leaves" },
      { name: "Veg Spring Roll", price: 180, foodType: "VEG" },
    ],
  },
  {
    category: "Main Course",
    items: [
      { name: "Dal Makhani", price: 220, foodType: "VEG", bestseller: true, variants: [["Half", 150], ["Full", 220]] },
      { name: "Butter Chicken", price: 340, foodType: "NON_VEG", bestseller: true, variants: [["Half", 220], ["Full", 340]] },
      { name: "Egg Curry", price: 190, foodType: "EGG" },
    ],
  },
  {
    category: "Breads",
    items: [
      { name: "Butter Naan", price: 60, foodType: "VEG" },
      { name: "Tandoori Roti", price: 30, foodType: "VEG" },
    ],
  },
  {
    category: "Beverages",
    items: [
      { name: "Masala Chai", price: 40, foodType: "VEG" },
      { name: "Sweet Lassi", price: 90, foodType: "VEG" },
    ],
  },
];

export async function createSampleMenu(tx: Prisma.TransactionClient, restaurantId: string) {
  for (const [ci, cat] of SAMPLE.entries()) {
    const category = await tx.category.create({ data: { restaurantId, name: cat.category, sortOrder: ci } });
    for (const [ii, item] of cat.items.entries()) {
      await tx.menuItem.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name: item.name,
          description: item.description,
          price: item.price,
          foodType: item.foodType,
          isBestseller: item.bestseller ?? false,
          sortOrder: ii,
          variants: item.variants
            ? { create: item.variants.map(([name, price], vi) => ({ name, price, sortOrder: vi })) }
            : undefined,
        },
      });
    }
  }
}
