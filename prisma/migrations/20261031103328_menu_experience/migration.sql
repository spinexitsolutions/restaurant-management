-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "isKidsFriendly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pairsWith" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ItemMedia" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishRating" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DishRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemMedia_menuItemId_idx" ON "ItemMedia"("menuItemId");

-- CreateIndex
CREATE INDEX "DishRating_restaurantId_createdAt_idx" ON "DishRating"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "DishRating_menuItemId_idx" ON "DishRating"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DishRating_orderId_menuItemId_key" ON "DishRating"("orderId", "menuItemId");

-- AddForeignKey
ALTER TABLE "ItemMedia" ADD CONSTRAINT "ItemMedia_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishRating" ADD CONSTRAINT "DishRating_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

