/*
  Warnings:

  - A unique constraint covering the columns `[shopId,code]` on the table `AlertRule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_shopId_code_key" ON "AlertRule"("shopId", "code");
