-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'AGGREGATOR';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastAnniversaryWish" INTEGER,
ADD COLUMN     "lastBirthdayWish" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "channelRef" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "swiggyCommission" DECIMAL(5,2) NOT NULL DEFAULT 25,
ADD COLUMN     "waAccessTokenEnc" TEXT,
ADD COLUMN     "waBillTemplate" TEXT,
ADD COLUMN     "waBirthdayTemplate" TEXT,
ADD COLUMN     "waBookingTemplate" TEXT,
ADD COLUMN     "waPhoneNumberId" TEXT,
ADD COLUMN     "waSummaryTemplate" TEXT,
ADD COLUMN     "waTemplateLang" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "zomatoCommission" DECIMAL(5,2) NOT NULL DEFAULT 25;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "cgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "PlatformCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_invoiceNumber_key" ON "SubscriptionPayment"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_razorpayPaymentId_key" ON "SubscriptionPayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_restaurantId_createdAt_idx" ON "SubscriptionPayment"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_restaurantId_createdAt_idx" ON "WhatsAppMessage"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing restaurant becomes its own organisation.
INSERT INTO "Organization" ("id", "name", "createdAt")
SELECT 'org_' || "id", "name", "createdAt" FROM "Restaurant" WHERE "organizationId" IS NULL;
UPDATE "Restaurant" SET "organizationId" = 'org_' || "id" WHERE "organizationId" IS NULL;
ALTER TABLE "Restaurant" ALTER COLUMN "organizationId" SET NOT NULL;
