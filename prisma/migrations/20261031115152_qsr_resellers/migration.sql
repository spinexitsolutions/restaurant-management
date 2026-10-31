-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'RESELLER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "tokenNumber" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "resellerId" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "displayKey" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
ADD COLUMN     "nextTokenNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tokenMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenSeqDate" TEXT;

-- Existing outlets got a random key above; new ones get a cuid from Prisma.
ALTER TABLE "Restaurant" ALTER COLUMN "displayKey" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerCommission" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "subscriptionPaymentId" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResellerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerPayout" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_code_key" ON "Reseller"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_userId_key" ON "Reseller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerCommission_subscriptionPaymentId_key" ON "ResellerCommission"("subscriptionPaymentId");

-- CreateIndex
CREATE INDEX "ResellerCommission_resellerId_createdAt_idx" ON "ResellerCommission"("resellerId", "createdAt");

-- CreateIndex
CREATE INDEX "ResellerPayout_resellerId_createdAt_idx" ON "ResellerPayout"("resellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_displayKey_key" ON "Restaurant"("displayKey");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerPayout" ADD CONSTRAINT "ResellerPayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

