-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('COURIER', 'PICKUP');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'COURIER',
ADD COLUMN     "pickupPointId" UUID;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "trackingCode" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "telegramChatId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "feeTiyin" BIGINT NOT NULL,
    "freeFromTiyin" BIGINT,
    "etaDaysMin" INTEGER NOT NULL,
    "etaDaysMax" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupPoint" (
    "id" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "address" TEXT NOT NULL,
    "hours" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "orderId" UUID,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_districtId_key" ON "DeliveryZone"("districtId");

-- CreateIndex
CREATE INDEX "PickupPoint_districtId_active_idx" ON "PickupPoint"("districtId", "active");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_orderId_idx" ON "Notification"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written guards.
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_fee_nonneg" CHECK ("feeTiyin" >= 0);
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_free_from_positive" CHECK ("freeFromTiyin" IS NULL OR "freeFromTiyin" > 0);
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_eta_range" CHECK ("etaDaysMin" >= 0 AND "etaDaysMax" >= "etaDaysMin" AND "etaDaysMax" <= 60);
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickup_has_point" CHECK (("deliveryType" = 'PICKUP') = ("pickupPointId" IS NOT NULL));
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_delivery_nonneg" CHECK ("deliveryTiyin" >= 0);
ALTER TABLE "Store" ADD CONSTRAINT "Store_telegram_chat_format" CHECK ("telegramChatId" IS NULL OR "telegramChatId" ~ '^-?[0-9]{1,20}$');
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_text_length" CHECK (length("text") BETWEEN 1 AND 1000);
