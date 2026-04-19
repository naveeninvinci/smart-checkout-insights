-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "financialStatus" TEXT,
ADD COLUMN     "paymentGatewayNames" JSONB,
ADD COLUMN     "primaryPaymentMethod" TEXT,
ADD COLUMN     "sourceName" TEXT;
