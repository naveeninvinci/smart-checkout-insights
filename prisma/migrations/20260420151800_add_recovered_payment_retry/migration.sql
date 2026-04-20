-- CreateTable
CREATE TABLE "RecoveredPaymentRetry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "gateway" TEXT NOT NULL,
    "failedStatus" TEXT,
    "failedKind" TEXT,
    "failedAt" TIMESTAMP(3),
    "failedErrorCode" TEXT,
    "successfulStatus" TEXT,
    "successfulKind" TEXT,
    "successfulAt" TIMESTAMP(3),
    "retryRecovered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "RecoveredPaymentRetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveredPaymentRetry_shopId_createdAt_idx" ON "RecoveredPaymentRetry"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveredPaymentRetry_shopId_checkoutToken_idx" ON "RecoveredPaymentRetry"("shopId", "checkoutToken");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveredPaymentRetry_shopId_orderId_key" ON "RecoveredPaymentRetry"("shopId", "orderId");

-- AddForeignKey
ALTER TABLE "RecoveredPaymentRetry" ADD CONSTRAINT "RecoveredPaymentRetry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
