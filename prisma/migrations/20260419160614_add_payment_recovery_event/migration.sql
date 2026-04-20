/*
  Warnings:

  - You are about to drop the `PaymentAttemptEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentAttemptEvent" DROP CONSTRAINT "PaymentAttemptEvent_shopId_fkey";

-- DropTable
DROP TABLE "PaymentAttemptEvent";

-- CreateTable
CREATE TABLE "PaymentRecoveryEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "failedGateway" TEXT NOT NULL,
    "failedStatus" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL,
    "successfulGateway" TEXT NOT NULL,
    "successfulKind" TEXT NOT NULL,
    "successfulAt" TIMESTAMP(3) NOT NULL,
    "switched" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRecoveryEvent_shopId_createdAt_idx" ON "PaymentRecoveryEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRecoveryEvent_shopId_switched_createdAt_idx" ON "PaymentRecoveryEvent"("shopId", "switched", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecoveryEvent_shopId_orderId_key" ON "PaymentRecoveryEvent"("shopId", "orderId");

-- AddForeignKey
ALTER TABLE "PaymentRecoveryEvent" ADD CONSTRAINT "PaymentRecoveryEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
