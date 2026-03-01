-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "webhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "checkoutToken" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "currency" TEXT,
    "value" DECIMAL(10,2),
    "country" TEXT,
    "device" TEXT,
    "lineItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutToken" TEXT,
    "currency" TEXT,
    "totalPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_webhookId_key" ON "WebhookEvent"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopId_topic_createdAt_idx" ON "WebhookEvent"("shopId", "topic", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutEvent_shopId_checkoutToken_createdAt_idx" ON "CheckoutEvent"("shopId", "checkoutToken", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutEvent_shopId_eventType_createdAt_idx" ON "CheckoutEvent"("shopId", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderEvent_orderId_key" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_shopId_createdAt_idx" ON "OrderEvent"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutEvent" ADD CONSTRAINT "CheckoutEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
