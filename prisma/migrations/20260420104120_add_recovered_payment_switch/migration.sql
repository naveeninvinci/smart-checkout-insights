/*
  Warnings:

  - You are about to drop the `PaymentRecoveryEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PaymentRecoveryEvent" DROP CONSTRAINT "PaymentRecoveryEvent_shopId_fkey";

-- DropTable
DROP TABLE "PaymentRecoveryEvent";

-- CreateTable
CREATE TABLE "RecoveredPaymentSwitch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "failedGateway" TEXT,
    "failedStatus" TEXT,
    "failedKind" TEXT,
    "failedAt" TIMESTAMP(3),
    "failedErrorCode" TEXT,
    "successfulGateway" TEXT NOT NULL,
    "successfulStatus" TEXT,
    "successfulKind" TEXT,
    "successfulAt" TIMESTAMP(3),
    "switchDetected" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "RecoveredPaymentSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveredPaymentSwitch_shopId_createdAt_idx" ON "RecoveredPaymentSwitch"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveredPaymentSwitch_shopId_checkoutToken_idx" ON "RecoveredPaymentSwitch"("shopId", "checkoutToken");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveredPaymentSwitch_shopId_orderId_key" ON "RecoveredPaymentSwitch"("shopId", "orderId");

-- AddForeignKey
ALTER TABLE "RecoveredPaymentSwitch" ADD CONSTRAINT "RecoveredPaymentSwitch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
