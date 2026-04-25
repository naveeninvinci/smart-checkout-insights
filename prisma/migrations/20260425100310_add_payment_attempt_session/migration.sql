-- CreateTable
CREATE TABLE "PaymentAttemptSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "checkoutToken" TEXT NOT NULL,
    "clientId" TEXT,
    "startedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "paymentInfoSubmittedCount" INTEGER NOT NULL DEFAULT 0,
    "checkoutAlertCount" INTEGER NOT NULL DEFAULT 0,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "matchedOrderId" TEXT,
    "recoveredToOrder" BOOLEAN NOT NULL DEFAULT false,
    "abandonedAfterPaymentAttempt" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,

    CONSTRAINT "PaymentAttemptSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAttemptSession_shopId_createdAt_idx" ON "PaymentAttemptSession"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttemptSession_shopId_checkoutToken_idx" ON "PaymentAttemptSession"("shopId", "checkoutToken");

-- CreateIndex
CREATE INDEX "PaymentAttemptSession_shopId_status_idx" ON "PaymentAttemptSession"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttemptSession_shopId_checkoutToken_key" ON "PaymentAttemptSession"("shopId", "checkoutToken");

-- AddForeignKey
ALTER TABLE "PaymentAttemptSession" ADD CONSTRAINT "PaymentAttemptSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
