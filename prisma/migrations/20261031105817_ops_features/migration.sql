-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "course" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastWinbackAt" TIMESTAMP(3),
ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "autoSoldOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "course" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firedAt" TIMESTAMP(3),
ADD COLUMN     "held" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "autoSoldOut" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "courseFiring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waWinbackTemplate" TEXT,
ADD COLUMN     "winbackDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "winbackEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "winbackOffer" TEXT NOT NULL DEFAULT '15% off your next visit';

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_qrId_key" ON "PaymentRequest"("qrId");

-- CreateIndex
CREATE INDEX "PaymentRequest_orderId_status_idx" ON "PaymentRequest"("orderId", "status");

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

